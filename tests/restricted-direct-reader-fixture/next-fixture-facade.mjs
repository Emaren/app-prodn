import {createRequire} from 'node:module';
const actual=createRequire(import.meta.url)('next/server');
export const NextRequest=actual.NextRequest, NextResponse=actual.NextResponse;
