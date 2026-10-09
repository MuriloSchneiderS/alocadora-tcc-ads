export type UserProfile = {
  nome: string;
  titulo: string;
  descricao: string;
  avatar: string;
};

export const DEFAULT_USER_AVATAR = "/assets/icone_usuario.png";
export const DEFAULT_CHANNEL_TITLE = "Espectador";
export const DEFAULT_CHANNEL_DESCRIPTION = "Este é o seu canal. Suas publicações aparecerão aqui.";

export function createDefaultUserProfile(nome: string): UserProfile {
  return {
    nome,
    titulo: DEFAULT_CHANNEL_TITLE,
    descricao: "",
    avatar: DEFAULT_USER_AVATAR,
  };
}