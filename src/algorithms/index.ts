import type { AnyAlgorithm } from '../core/types';
import { deutschJozsa } from './deutsch-jozsa';
import { grover } from './grover';

/**
 * Every algorithm the app can show. Adding one is one file plus one line here.
 */
export const algorithms: AnyAlgorithm[] = [grover, deutschJozsa];
