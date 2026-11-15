// PUBLIC half of the Screen-View Pro signing key (ECDSA P-256), as a JWK.
//
// PLACEHOLDER: no real key is installed in this private packaging build.
// Tony makes the real key pair on his own computer (see MORNING-APPROVALS.md); only the
// PUBLIC half ever goes here. The secret half must never be in the app or on this box.
//
// While this is null, Pro keys cannot be checked and Pro stays locked. The test runner and
// tools/demo-pro.mjs serve a different copy of THIS FILE ONLY, holding a THROWAWAY TEST
// public key made in memory for that run (its private half is thrown away afterwards).
'use strict';
window.SV_PRO_PUBLIC_KEY_JWK = null;
