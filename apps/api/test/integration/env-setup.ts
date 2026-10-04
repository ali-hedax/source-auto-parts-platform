import { inject } from 'vitest';

// Every test worker gets the environment prepared by global-setup before the compiled app is imported.
Object.assign(process.env, inject('hedaxEnv'));
