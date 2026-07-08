# CORTEX WhatsApp bridge (read-only whatsmeow sidecar). CGO for go-sqlite3.
FROM golang:1.25 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -trimpath -o /wa-bridge .

FROM debian:stable-slim
RUN useradd --system --create-home wa && mkdir -p /data && chown wa /data
COPY --from=build /wa-bridge /usr/local/bin/wa-bridge
USER wa
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/wa-bridge"]
