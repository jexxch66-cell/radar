# RADAR

Angular (frontend) + Spring Boot (backend) + PostgreSQL.

## Requisitos

- Git
- Java 17 o superior (`java -version`)
- Maven 3.9+ (`mvn -v`)
- Node 20+ y npm (`node -v`)
- Docker Desktop (para la base de datos) **o** PostgreSQL instalado a mano

## Levantar en local

Abrir 3 terminales en la raíz del proyecto.

### 1. Base de datos

```bash
docker compose up -d
```

Crea PostgreSQL en `localhost:5432` con base `radar_db`, usuario `radar_user`, contraseña `changeme_local_dev`
(son los valores por defecto del backend, no hay que configurar nada).

Sin Docker: instalar PostgreSQL y crear la base y el usuario:

```sql
CREATE USER radar_user WITH PASSWORD 'changeme_local_dev';
CREATE DATABASE radar_db OWNER radar_user;
```

### 2. Backend (http://localhost:8080)

```bash
cd backend
mvn spring-boot:run
```

Las tablas se crean solas. También se crea un admin por defecto:
`admin@radar.com` / `Admin123!`

### 3. Frontend (http://localhost:4200)

```bash
cd frontend
npm install
npm start
```

## Problemas comunes

| Error | Causa / solución |
|---|---|
| `Connection to localhost:5432 refused` | La base no está corriendo. Ejecutar `docker compose up -d` (y abrir Docker Desktop). |
| `password authentication failed` | El usuario/contraseña de Postgres no coincide con los de arriba. |
| `Port 8080 already in use` | Cerrar el proceso que usa el puerto 8080, o `set PORT=8081` antes de correr el backend. |
| `release version 17 not supported` | Instalar Java 17 o superior. |

## Flujo de trabajo en equipo

- No trabajar directo sobre `main`. Crear una rama: `git checkout -b feature/lo-que-hago`.
- Commits pequeños y `git push -u origin feature/lo-que-hago`.
- Abrir Pull Request en GitHub y pedir revisión antes de mezclar.
- Antes de empezar a trabajar: `git pull`.

## Producción

Backend en Render (`render.yaml`) y frontend en Vercel. No tocar la configuración de producción sin avisar al equipo.
