#!/bin/sh
set -e

# Render (and other PaaS) provide DATABASE_URL as postgres://user:pass@host:port/db.
# Spring's JDBC driver needs jdbc:postgresql://host:port/db plus separate credentials,
# and Render PostgreSQL requires SSL (sslmode=require).
if [ -n "$DATABASE_URL" ]; then
  case "$DATABASE_URL" in
    postgres://*|postgresql://*)
      rest="${DATABASE_URL#*://}"
      creds="${rest%%@*}"
      hostpart="${rest#*@}"

      export DB_USERNAME="${creds%%:*}"
      export DB_PASSWORD="${creds#*:}"

      case "$hostpart" in
        *\?*sslmode=*)
          ;;
        *\?*)
          hostpart="${hostpart}&sslmode=require"
          ;;
        *)
          hostpart="${hostpart}?sslmode=require"
          ;;
      esac

      export DATABASE_URL="jdbc:postgresql://${hostpart}"
      export SPRING_DATASOURCE_URL="$DATABASE_URL"
      export SPRING_DATASOURCE_USERNAME="$DB_USERNAME"
      export SPRING_DATASOURCE_PASSWORD="$DB_PASSWORD"
      ;;
  esac
fi

exec java -jar app.jar
