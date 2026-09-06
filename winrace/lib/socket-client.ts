"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | undefined;

/** Client-seitiger Singleton – eine Verbindung pro Browser-Tab, egal wie viele Komponenten sie nutzen. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}
