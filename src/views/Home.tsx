"use client"

/**
 * The Home page lives in Platizio_Global_Revamp/Home.tsx so the whole revamp —
 * docs, components, styles — stays reviewable in one directory.
 *
 * Verified by build spike: no Vite alias is needed. Both the client build and
 * the SSR prerender run with root: ROOT, so this relative import resolves in
 * both passes.
 */
export { default } from '../../Platizio_Global_Revamp/Home'
