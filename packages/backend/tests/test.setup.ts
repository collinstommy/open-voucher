/// <reference types="vite/client" />

/**
 * Module loader for convex-test
 * This file uses import.meta.glob which requires Vite
 */
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
