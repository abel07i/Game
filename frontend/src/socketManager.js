import { io } from 'socket.io-client';

let socketInstance = null;
let listeners = new Map(); // Track registered listeners for cleanup

/**
 * Initialize or get the socket connection (singleton pattern with proper cleanup)
 */
export function getSocket() {
  if (!socketInstance || !socketInstance.connected) {
    socketInstance = io('http://localhost:3000', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });
  }
  return socketInstance;
}

/**
 * Register an event listener with automatic cleanup tracking
 */
export function onSocketEvent(eventName, handler) {
  const socket = getSocket();
  
  // Track the listener so we can clean it up later
  if (!listeners.has(eventName)) {
    listeners.set(eventName, []);
  }
  listeners.get(eventName).push(handler);
  
  socket.on(eventName, handler);
  
  // Return a cleanup function
  return () => {
    socket.off(eventName, handler);
    const eventListeners = listeners.get(eventName);
    if (eventListeners) {
      const index = eventListeners.indexOf(handler);
      if (index > -1) eventListeners.splice(index, 1);
    }
  };
}

/**
 * Clean up all listeners for a specific event
 */
export function offSocketEvent(eventName) {
  const socket = getSocket();
  const eventListeners = listeners.get(eventName) || [];
  
  eventListeners.forEach(handler => {
    socket.off(eventName, handler);
  });
  
  listeners.delete(eventName);
}

/**
 * Clean up all socket listeners (call on component unmount)
 */
export function cleanupSocket() {
  const socket = getSocket();
  
  // Remove all tracked listeners
  listeners.forEach((handlers, eventName) => {
    handlers.forEach(handler => {
      socket.off(eventName, handler);
    });
  });
  
  listeners.clear();
}

/**
 * Disconnect the socket (call on app exit)
 */
export function disconnectSocket() {
  if (socketInstance && socketInstance.connected) {
    socketInstance.disconnect();
    socketInstance = null;
  }
  listeners.clear();
}
