package com.radar.api.exception;

public class InvalidCredentialsException extends RuntimeException {

    public InvalidCredentialsException() {
        super("Email o contrasena invalidos");
    }
}
