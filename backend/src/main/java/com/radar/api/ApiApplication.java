package com.radar.api;

// Importamos las clases base de arranque de Spring Boot y el soporte de tareas programadas (cron/scheduler)
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// @SpringBootApplication activa la autoconfiguración, el escaneo de componentes (@Controller, @Service, @Repository) y las propiedades
@SpringBootApplication
// @EnableScheduling habilita las tareas automáticas en segundo plano (usado por BackupService para backups programados)
@EnableScheduling
public class ApiApplication {

    // Punto de entrada principal (main) que levanta el servidor Tomcat embebido y conecta con PostgreSQL
    public static void main(String[] args) {
        SpringApplication.run(ApiApplication.class, args);
    }

}
