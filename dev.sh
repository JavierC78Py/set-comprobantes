#!/bin/bash

PIDFILE=".dev.pid"

start() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Los servicios ya están corriendo (PID $(cat "$PIDFILE"))"
    return 1
  fi

  npm run dev:all &
  echo $! > "$PIDFILE"
  echo "Servicios iniciados (PID $!)"
}

stop() {
  if [ ! -f "$PIDFILE" ]; then
    echo "No se encontró PID file. Intentando matar procesos por nombre..."
    pkill -f "concurrently.*frontend,api,worker" 2>/dev/null
    pkill -f "ts-node-dev.*src/main.ts" 2>/dev/null
    pkill -f "ts-node-dev.*src/worker.ts" 2>/dev/null
    pkill -f "vite.*set-comprobantes" 2>/dev/null
    echo "Procesos terminados"
    return 0
  fi

  PID=$(cat "$PIDFILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null
    # Matar hijos huérfanos
    pkill -f "ts-node-dev.*src/main.ts" 2>/dev/null
    pkill -f "ts-node-dev.*src/worker.ts" 2>/dev/null
    pkill -f "vite.*set-comprobantes" 2>/dev/null
    echo "Servicios detenidos"
  else
    echo "El proceso $PID ya no existe"
  fi
  rm -f "$PIDFILE"
}

status() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Servicios corriendo (PID $(cat "$PIDFILE"))"
  else
    echo "Servicios detenidos"
    rm -f "$PIDFILE" 2>/dev/null
  fi
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; sleep 1; start ;;
  status)  status ;;
  *)
    echo "Uso: ./dev.sh {start|stop|restart|status}"
    exit 1
    ;;
esac
