// types.d.ts
export {}; // This makes it a module, important for Next.js

declare global {
  interface Window {
    firebaseAuth: any; // or if you want you can do firebaseAuth: import('firebase/auth').Auth;
  }
}
