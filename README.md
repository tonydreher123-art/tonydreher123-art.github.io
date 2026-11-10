# Screen-View browser test

A small test page: show one computer's browser tab or screen on a phone, browser to browser (WebRTC).

- Sender (Chromebook / computer): https://tonydreher123-art.github.io/screen-view/
- Viewer (phone): open the link or scan the QR code that the sender page shows (`view.html#ROOMCODE`).

How it works: the sender page makes a random 8-character room code. The free public PeerJS server
(0.peerjs.com) only helps the two browsers find each other. The video goes directly between them
(Google STUN, no TURN relay). Chrome asks the sender which tab, window or screen to share; nothing is captured before that.

This is a test. Don't share private material. Third-party code: see `screen-view/LICENSES.txt` (PeerJS and QR generator, both MIT).
