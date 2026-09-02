export interface RegisterRequest {
  nombre: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// Espejo del AuthResponse del backend (nunca se expone la entidad User completa)
export interface AuthResponse {
  token: string;
  tipo: string;
  id: number;
  nombre: string;
  email: string;
}

export interface AuthUser {
  id: number;
  nombre: string;
  email: string;
}

// Forma del error JSON que devuelve el GlobalExceptionHandler del backend
export interface ApiErrorResponse {
  timestamp: string;
  status: number;
  message: string;
  fieldErrors?: Record<string, string>;
}
