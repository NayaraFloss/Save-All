export const getRoleLabel = (role) => {
  switch (role) {
    case "client":
      return "Cliente";
    case "store":
      return "Estabelecimento";
    case "institution":
      return "Entidade Social";
    case "disposal":
      return "Descarte Sustent\xE1vel";
    case "master":
      return "Admin Master";
    default:
      return role;
  }
};

const ROLE_COLORS = {
  master: "amber-8",
  client: "green-7",
  store: "blue-7",
  institution: "pink-6",
  disposal: "teal-6"
};

export const roleColor = (role) => ROLE_COLORS[role] || "teal-6";

export const formatDateTime = (value) => new Date(value).toLocaleString("pt-BR");
