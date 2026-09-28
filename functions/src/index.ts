import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onObjectDeleted, onObjectFinalized } from "firebase-functions/v2/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();
const reservationLifetimeMs = 60 * 60 * 1000;
const maxStorageBytes = Number(process.env.MAX_STORAGE_BYTES ?? 4 * 1024 ** 3);
const usageRef = db.collection("storageUsage").doc("total");

function storageObjectId(path: string) {
  return Buffer.from(path).toString("base64url");
}

async function getInitialStorageUsage() {
  const [files] = await bucket.getFiles({ autoPaginate: true });
  return files.reduce((total, file) => total + Number(file.metadata.size ?? 0), 0);
}

function getUploadPath(publicationId: string, kind: string, extension: string) {
  if (kind === "thumbnail") return `publicacoes/miniaturas/${publicationId}.${extension}`;
  if (kind === "archive") return `publicacoes/arquivos/${publicationId}/arquivo.${extension}`;
  throw new HttpsError("invalid-argument", "Tipo de arquivo invalido.");
}

function validateExtension(kind: string, extension: string) {
  const allowed = kind === "thumbnail"
    ? ["webp", "jpg", "jpeg", "png"]
    : ["mp4", "m4a", "webm", "avi", "mkv", "mov", "pdf", "epub", "webp", "jpg", "jpeg", "png", "gif"];
  if (!allowed.includes(extension)) throw new HttpsError("invalid-argument", "Formato de arquivo nao permitido.");
}

async function releaseReservation(reservationId: string, uid?: string) {
  const reservationRef = db.collection("storageReservations").doc(reservationId);
  await db.runTransaction(async (transaction) => {
    const reservationSnapshot = await transaction.get(reservationRef);
    if (!reservationSnapshot.exists) return;
    const reservation = reservationSnapshot.data()!;
    if (uid && reservation.uid !== uid) throw new HttpsError("permission-denied", "Reserva nao pertence ao usuario.");
    if (reservation.status !== "reserved") return;

    const usageSnapshot = await transaction.get(usageRef);
    const reservedBytes = Number(usageSnapshot.data()?.reservedBytes ?? 0);
    transaction.set(usageRef, {
      usedBytes: Number(usageSnapshot.data()?.usedBytes ?? 0),
      reservedBytes: Math.max(0, reservedBytes - reservation.size),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.delete(reservationRef);
  });
}

async function commitStorageObject(path: string, size: number, reservationId: string) {
  const reservationRef = db.collection("storageReservations").doc(reservationId);
  const objectRef = db.collection("storageObjects").doc(storageObjectId(path));

  return db.runTransaction(async (transaction) => {
    const reservationSnapshot = await transaction.get(reservationRef);
    if (!reservationSnapshot.exists) return false;
    const reservation = reservationSnapshot.data()!;

    if (reservation.status === "committed" && reservation.path === path) return true;
    if (reservation.status !== "reserved" || reservation.path !== path || reservation.size !== size) return false;

    const usageSnapshot = await transaction.get(usageRef);
    const usage = usageSnapshot.data() ?? { usedBytes: 0, reservedBytes: 0 };
    transaction.set(usageRef, {
      usedBytes: Number(usage.usedBytes ?? 0) + size,
      reservedBytes: Math.max(0, Number(usage.reservedBytes ?? 0) - reservation.size),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(reservationRef, { status: "committed", committedAt: FieldValue.serverTimestamp() });
    transaction.set(objectRef, { path, size, reservationId, status: "stored" });
    return true;
  });
}

export const reservePublicationUpload = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para publicar.");

  const publicationId = String(request.data?.publicationId ?? "");
  const kind = String(request.data?.kind ?? "");
  const extension = String(request.data?.extension ?? "").toLowerCase();
  const size = Number(request.data?.size);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(publicationId) || !Number.isSafeInteger(size) || size <= 0) {
    throw new HttpsError("invalid-argument", "Dados do arquivo invalidos.");
  }

  validateExtension(kind, extension);
  const path = getUploadPath(publicationId, kind, extension);

  const reservationId = randomUUID();
  const reservationRef = db.collection("storageReservations").doc(reservationId);
  const expiresAt = Timestamp.fromMillis(Date.now() + reservationLifetimeMs);
  const existingUsage = await usageRef.get();
  const initialUsedBytes = existingUsage.exists ? 0 : await getInitialStorageUsage();

  await db.runTransaction(async (transaction) => {
    const usageSnapshot = await transaction.get(usageRef);
    const usage = usageSnapshot.data() ?? { usedBytes: initialUsedBytes, reservedBytes: 0 };
    const usedBytes = Number(usage.usedBytes ?? 0);
    const reservedBytes = Number(usage.reservedBytes ?? 0);
    if (!Number.isSafeInteger(maxStorageBytes) || maxStorageBytes <= 0 || usedBytes + reservedBytes + size > maxStorageBytes) {
      throw new HttpsError("resource-exhausted", "O limite de armazenamento configurado foi atingido.");
    }

    transaction.set(usageRef, {
      usedBytes,
      reservedBytes: reservedBytes + size,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(reservationRef, {
      uid,
      publicationId,
      path,
      size,
      status: "reserved",
      expiresAt,
    });
  });

  return { reservationId, path };
});

export const cancelPublicationUpload = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  const reservationId = String(request.data?.reservationId ?? "");
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para continuar.");
  if (!/^[0-9a-f-]{36}$/i.test(reservationId)) throw new HttpsError("invalid-argument", "Reserva invalida.");

  const reservation = await db.collection("storageReservations").doc(reservationId).get();
  if (!reservation.exists || reservation.data()?.uid !== uid) return { released: false };
  const data = reservation.data()!;
  const [exists] = await bucket.file(data.path).exists();
  if (exists) {
    await commitStorageObject(data.path, data.size, reservationId);
    return { released: false };
  }

  await releaseReservation(reservationId, uid);
  return { released: true };
});

export const accountStorageUpload = onObjectFinalized({ region: "us-east1" }, async (event) => {
  const object = event.data;
  const path = object.name;
  if (!path) return;
  const reservationId = object.metadata?.reservationId;
  const size = Number(object.size ?? 0);
  if (!reservationId || !await commitStorageObject(path, size, reservationId)) {
    await bucket.file(path).delete({ ignoreNotFound: true });
  }
});

export const accountStorageDeletion = onObjectDeleted({ region: "us-east1" }, async (event) => {
  const path = event.data.name;
  if (!path) return;
  const objectRef = db.collection("storageObjects").doc(storageObjectId(path));

  await db.runTransaction(async (transaction) => {
    const objectSnapshot = await transaction.get(objectRef);
    if (!objectSnapshot.exists) return;
    const storedObject = objectSnapshot.data()!;
    const usageSnapshot = await transaction.get(usageRef);
    const usage = usageSnapshot.data() ?? { usedBytes: 0, reservedBytes: 0 };
    transaction.set(usageRef, {
      usedBytes: Math.max(0, Number(usage.usedBytes ?? 0) - storedObject.size),
      reservedBytes: Number(usage.reservedBytes ?? 0),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.delete(objectRef);
    transaction.update(db.collection("storageReservations").doc(storedObject.reservationId), { status: "deleted" });
  });
});

export const clearExpiredUploadReservations = onSchedule("every 60 minutes", async () => {
  const now = Timestamp.now();
  const reservations = await db.collection("storageReservations")
    .where("status", "==", "reserved")
    .where("expiresAt", "<=", now)
    .orderBy("expiresAt")
    .limit(500)
    .get();

  for (const reservationSnapshot of reservations.docs) {
    const reservation = reservationSnapshot.data();
    const [exists] = await bucket.file(reservation.path).exists();
    if (exists) {
      await commitStorageObject(reservation.path, reservation.size, reservationSnapshot.id);
    } else {
      await releaseReservation(reservationSnapshot.id);
    }
  }
});