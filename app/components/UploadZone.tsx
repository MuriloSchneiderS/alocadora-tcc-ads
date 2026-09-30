"use client";

import { useDropzone, type Accept } from "react-dropzone";
import { useState } from "react";

type UploadZoneProps = {
  label?: string;
  formats?: string;
  className?: string;
  accept?: Accept;
  disabled?: boolean;//Desabilita quando estiver enviando o arquivo
  onFileAccepted?: (file: File) => void;
};

//Componente para upload de arquivos, com suporte a drag and drop e validação de formatos aceitos.
export default function UploadZone({ label = "Fazer upload de arquivo", formats = "Formatos aceitos: jpg, png, webp.", className = "", accept, disabled = false, onFileAccepted }: UploadZoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rejectionMessage, setRejectionMessage] = useState("");
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple: false,
    disabled,
    onDrop: (acceptedFiles, fileRejections) => {
      const file = acceptedFiles[0];
      setRejectionMessage(fileRejections.length > 0 ? "Este arquivo não é compatível com o formato aceito." : "");

      if (!file) return;
      setSelectedFile(file);
      onFileAccepted?.(file);
    },
  });

  return (
    <div {...getRootProps({ className: `flex ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-[#77756e]"} flex-col items-center justify-center border border-black/40 bg-panel-muted px-5 text-center text-sm text-white ${isDragActive ? "border-gold bg-[#77756e]" : ""} ${className}` })}>
      <input {...getInputProps()} />
      <span className="mb-2 text-4xl font-light text-navy" aria-hidden="true">⇧</span>
      <span>{selectedFile ? selectedFile.name : isDragActive ? "Solte o arquivo aqui" : label}</span>
      <span className="mt-3 max-w-64 text-cream">{formats}</span>
      {rejectionMessage && <span className="mt-2 max-w-64 text-xs text-red">{rejectionMessage}</span>}
    </div>
  );
}