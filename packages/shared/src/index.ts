// Single API/domain contract for backend + frontend (ADR-0003).
// Pure only: no I/O, no React — it is bundled into both sides.
// geo/ arrives with T-1.1, dates/ with T-3.1.
export * from './constants';
export * from './schemas';
export * from './types';
export * from './spoiler';
