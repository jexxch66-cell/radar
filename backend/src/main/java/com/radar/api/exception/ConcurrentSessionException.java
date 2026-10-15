package com.radar.api.exception;

public class ConcurrentSessionException extends RuntimeException {
    public ConcurrentSessionException() {
        super("Ya existe una sesión activa para este usuario en otro navegador o pestaña. Cierra la sesión activa antes de iniciar una nueva.");
    }

    public ConcurrentSessionException(String message) {
        super(message);
    }
}

