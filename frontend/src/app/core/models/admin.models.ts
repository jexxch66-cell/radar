export interface RegisterAdminRequest {
  nombre: string;
  email: string;
  password: string;
}

export interface AdministradorResponse {
  id: number;
  nombre: string;
  email: string;
  createdAt: string;
}
