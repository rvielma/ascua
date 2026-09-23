#!/usr/bin/env node
import { principal } from "../src/index.js";

process.exitCode = await principal(process.argv.slice(2));
