package com.radar.api.config;

import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.BlobServiceClientBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.type.AnnotatedTypeMetadata;

@Configuration
public class BackupStorageConfig {

    @Bean
    @Conditional(AzureStorageConfigured.class)
    public BlobServiceClient backupBlobServiceClient(
            @Value("${app.backup.azure-connection-string}") String connectionString) {
        return new BlobServiceClientBuilder()
                .connectionString(connectionString)
                .buildClient();
    }

    public static class AzureStorageConfigured implements Condition {

        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            String connectionString = context.getEnvironment().getProperty("app.backup.azure-connection-string");
            return connectionString != null && !connectionString.isBlank();
        }
    }
}
