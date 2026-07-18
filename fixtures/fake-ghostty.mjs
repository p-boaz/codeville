#!/usr/bin/env node
/* global process */
import { appendFileSync } from 'node:fs';
if (process.env.CODEVILLE_FAKE_GHOSTTY_LOG) appendFileSync(process.env.CODEVILLE_FAKE_GHOSTTY_LOG, `${JSON.stringify(process.argv.slice(2))}\n`);
