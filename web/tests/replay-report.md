# Automatic replay implementation

## Architecture and safety

`replayRecorder.ts` owns snapshots/events. `replayPlayback.ts` owns playback time, camera framing, input/session phases. `ReplayDirector.tsx` records after all live animation callbacks and temporarily applies recorded transforms only while drawing. It restores live transforms in `finally`, with reusable Float64 scratch storage to preserve live values exactly. `ReplayOverlay.tsx` / `replay.css` provide the broadcast tag, skip control and cuts. App integration adds visual-root refs and presentation/input gates, not physics or scoring changes.

Only FOUR, SIX, BOWLED, CAUGHT and CAUGHT BEHIND trigger. Normal DOT/1/2/3/miss results do not. The existing result must be scored by the existing lifecycle before playback begins. Live celebration gets at least 850ms; BOWLED gets the complete 1500ms live wicket presentation. Recording continues through that hold. No replay calls Delivery.step, MatchResult collision/update, score.consume, fielding or keeper logic. The main live loop is paused during PLAYING/EXITING. Wicket's optional presentation-pause gate prevents a second physics/audio update during playback; its physics implementation is unchanged.

## Recorded visual state

- Final rendered local position, quaternion, scale and visibility throughout the bat, ball/seam, bowler, keeper, fielders and batting wicket visual trees.
- Bat includes both its authoritative parent and final visual-stabilization child offset, so playback follows the actual visible bat rather than current sensor input.
- Wicket stump/bail motion is recorded as transforms; detached bails are never re-simulated.
- Fielder/keeper limb poses and facing are captured through the rendered mesh transforms, not invented replay animations.
- Release, bounce, contact, boundary, wicket and collection event markers. Contact/wicket timing comes from authoritative event state and existing MatchResult age/impact timestamp, observed after the live physics frame; it is not guessed from proximity.
- Actual ball positions and hit state for camera/trail history. No webcam video, raw phone stream, screenshots or scene clones.

Sampling is 30Hz, plus forced event-frame samples. Buffer is capped at 960 snapshots (roughly 32 seconds), per latest delivery only. After saturation it preserves the opening ~6 seconds and recent history by dropping intervening samples. Normal deliveries fit within this budget; unusually long deliveries can therefore lose middle context. Next delivery clears frames/events/deduplication state. Float32 transform storage costs 44 bytes/object/snapshot: maximum about 42KB per tracked object across the entire buffer, plus small timestamp/ball/event overhead. Only dynamic visual roots are traversed, once per delivery; the stadium is not recorded. Exact memory depends on the visual-node count.

## Cameras and timing

- FOUR: offset behind/around the batting area (-4.2,2.5,4.8); contact is framed with bat/pitch, then a damped pan follows the recorded ball into the field.
- SIX: lower side/behind angle (-3.8,1.5,4.8), then rises/pans with the recorded launch, without orbit/shake.
- BOWLED: wicket-side view around (3.2,1.8,3.8), looking toward the batting wicket to expose recorded ball/miss/stump/bail motion.
- CAUGHT: begins with contact/flight framing and eases toward the recorded catch location in the final portion, keeping the catching fielder nearby.
- CAUGHT BEHIND: keeper-side framing around (3.2,2.2,6.5).

All camera changes are damped, not orbiting. Replay starts near actual release and includes contact/impact and immediate outcome. Playback baseline is 0.65x, easing to 0.42x within 140ms of recorded contact/wicket, with a 0.65x shoulder within 380ms. Long travel outside that moment is accelerated adaptively so clips generally fit about 3–6 seconds instead of stretching an entire boundary shot into prolonged slow motion. No ball/bat position is changed to manufacture contact.

Entry is a 160ms dark-to-scene cut. Exit darkens for 160ms, restores live camera/controller under a further 160ms reveal, and only then re-enables delivery inputs. No batsman model, arms or hands were added.

## Trails, overlay and audio

Replay trail uses only recorded past ball samples, never future prediction. Incoming appearance stays the subtle 120ms / opacity 0.12 style; post-hit stays stronger 4s / opacity 0.42. The geometry buffer is reused and bounded to 192 points. The live BallTrail implementation and its settings were not edited. Thirty-Hz recording means replay history is less densely sampled than a higher-frame-rate live trail. Bounce event frames preserve recent descent/rebound context.

Normal HUD/result panels are hidden visually while the small black/white/neutral REPLAY + authoritative outcome tag is present. SPACE/ESC and the SKIP button end replay. Keyboard events are captured/consumed; repeat keys cannot keep restarting the exit fade. Phone bowl requests are discarded, ready=false is published, and the bowl-call gesture is paused during playback. Inputs remain gated through the return reveal, avoiding queued delivery requests.

Replay does not retrigger audio. Original live audio is unchanged and may finish naturally underneath; impact/crowd sounds are not blindly doubled. No replay-only fake wicket animation is run.

## Verification

Passed: `replay.cjs`, `wicket-presentation.cjs`, `fielding-lifecycle.cjs`, `batting-hud.cjs`. Replay tests cover all eligible outcomes, exclusion of non-highlights, independent/bounded snapshots, recorded ball/bat/wicket/fielder/keeper rendering, exact restoration, unchanged score/balls/wickets/outcome, live wicket hold/scoring gates, captured SPACE/ESC, the actual main-loop phone suppression branch, repeated skip and next-delivery cleanup.

Typecheck passed. ONE `npm run build` passed: 117 modules; main JS 1,354.33KB / gzip 386.13KB. Vite's existing >500KB chunk advisory remains.

Existing unrelated failures left untouched: `session-controls.cjs` expects the old stationary-lock behavior; `game-modes.cjs` expects FAST maximum 21 instead of the current 24. Related source-based HUD/wicket test fixtures were updated for the new replay gate, not weakened gameplay expectations.

The browser skill was used to check visual-test availability; no browser is connected. No screenshot review or physical-playtest success is claimed. In-game verification still needs FOUR/SIX contact/flight framing, BOWLED bail visibility, catcher/keeper framing, incoming/post-hit trail appearance, phone-movement isolation, SPACE/ESC/phone requests during replay, match-ending replays and clean return to the current live hand position. Exceptionally long delivery buffer truncation also merits review if encountered.

## Frozen systems

No edits to delivery/batting physics, collisions/reach, mapping/stabilization, shot power/direction/SIX rules, pace/spin bounce, AI lines/swing/turn/tactics, fielding/keeper mechanics, field plans, Assist, ball scale/emissive, scoring rules or game modes. Changes to App/Wicket are presentation/lifecycle pause/input/render integration only. Existing wicket presentation still owns live stump physics and its 1.5-second hold.
