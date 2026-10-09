// Run against a downloaded official desktop artifact; never starts/logs in the app.
import { installedAgentExecutable } from '../compat/platform.mjs';
import { loadSidecarSdk } from '../sidecars/panel/sdk.mjs';
import assert from 'node:assert/strict';
const binary=installedAgentExecutable();
const sdk=await loadSidecarSdk();
assert.equal(typeof sdk.SidecarApp,'function');
assert.equal(typeof sdk.Response,'function');
console.log(JSON.stringify({platform:process.platform,arch:process.arch,hostBinaryFound:true,embeddedSdkLoaded:true}));
