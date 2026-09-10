#!/bin/sh
# Render (and other PaaS) provide DATABASE_URL as postgres://user:pass@host:port/db.
# Spring's JDBC driver needs jdbc:postgresql://host:port/db plus separate credentials,
# so rewrite it here before starting the app.
case "$DATABASE_URL" in
  postgres://*|postgresql://*)
    rest="${DATABASE_URL#*://}"
    creds="${rest%%@*}"
    hostpart="${rest#*@}"
    export DB_USERNAME="${creds%%:*}"
    export DB_PASSWORD="${creds#*:}"
    export DATABASE_URL="jdbc:postgresql://${hostpart}"
    ;;
esac

exec java -jar app.jar
