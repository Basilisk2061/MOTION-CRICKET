"""Two colored image markers; fixed depth/roll, NOT a full 3D pose solver."""
import math

import cv2
import numpy as np

# OpenCV HSV: H 0..179, S/V 0..255. Change these four bounds for your tape.
# Use 4–6 cm visible patches: A just above the grip; B on the blade face.
MARKER_A_LOWER, MARKER_A_UPPER = (100, 100, 70), (130, 255, 255)  # blue handle
MARKER_B_LOWER, MARKER_B_UPPER = (40, 100, 70), (85, 255, 255)  # green blade
MARKER_SEPARATION_METRES = 0.40  # actual distance between tape centres
MIN_AREA = 60
MAX_AREA_FRACTION = 0.08
MIN_SEPARATION_PIXELS = 25
LOSS_HOLD_SECONDS = 0.20
BASE_HANDLE = np.array((0.32, 1.05, -0.65))
MAX_PAIR_AREA_RATIO = 3.0
PATCH_LENGTH_METRES = 0.05  # approximate visible tape length, used only to rank pairs
DEBUG_IMAGE = 'ORIGINAL - mirrored webcam (1: BLUE A, 2: GREEN B, then click)'
MASK_WINDOWS = ('BLUE mask / A', 'GREEN mask / B')


class MarkerTracker:
    def __init__(self):
        self.reference = None
        self.scale = None
        self.last_seen = None
        self.position = None
        self.axis = None
        self.calibrate_at = None
        self.points = (None, None)
        self.bounds = [[list(MARKER_A_LOWER), list(MARKER_A_UPPER)],
                       [list(MARKER_B_LOWER), list(MARKER_B_UPPER)]]
        self.debug = False
        self.sample_target = None
        self.debug_frame = None
        self.display_size = None
        self.clicks = {}
        self.pair_reason = ''

    def toggle_debug(self):
        self.debug = not self.debug
        if self.debug:
            cv2.namedWindow(DEBUG_IMAGE, cv2.WINDOW_AUTOSIZE)
            cv2.setMouseCallback(DEBUG_IMAGE, self.sample_click)
            for window, bounds in zip(MASK_WINDOWS, self.bounds):
                cv2.namedWindow(window, cv2.WINDOW_NORMAL)
                for channel, maximum in enumerate((179, 255, 255)):
                    for bound, suffix in enumerate(('min', 'max')):
                        cv2.createTrackbar(f'{"HSV"[channel]} {suffix}', window,
                                          bounds[bound][channel], maximum, lambda _: None)
        else:
            self.sample_target = None
            self.debug_frame = None
            self.display_size = None
            for window in (DEBUG_IMAGE, *MASK_WINDOWS):
                try:
                    cv2.destroyWindow(window)
                except cv2.error:
                    pass

    def print_bounds(self):
        for name, (lower, upper) in zip(('A', 'B'), self.bounds):
            print(f'MARKER_{name}_LOWER = {tuple(lower)}\nMARKER_{name}_UPPER = {tuple(upper)}')

    def select_sample(self, index):
        if self.debug:
            self.sample_target = index
            print(f'SELECT {("BLUE A", "GREEN B")[index]}: click tape centre in ORIGINAL')

    def sample_click(self, event, x, y, flags, param):
        if (event != cv2.EVENT_LBUTTONDOWN or not self.debug
                or self.sample_target is None or self.debug_frame is None):
            return
        height, width = self.debug_frame.shape[:2]
        print(f'display x,y: {x},{y}\nsample x,y: {x},{y}\n'
              f'display frame width,height: {self.display_size}\n'
              f'sample frame width,height: {(width, height)}')
        if self.display_size != (width, height):
            print('CLICK REJECTED: display/sample dimensions differ')
            return
        if not (0 <= x < width and 0 <= y < height):
            return
        # Sample the untouched BGR snapshot used for this exact unscaled preview.
        patch = self.debug_frame[max(0, y-3):min(height, y+4), max(0, x-3):min(width, x+4)]
        hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV).reshape(-1, 3)
        valid = (hsv[:, 2] >= 25) & (hsv[:, 1] >= 25)
        if np.count_nonzero(valid) < max(3, len(hsv) // 3):
            print('SAMPLE REJECTED: patch too dark/desaturated; click tape centre again')
            return
        pixels = hsv[valid].astype(float)
        # Unwrap hue around the circular mean before taking a robust median.
        angles = pixels[:, 0] * (2 * math.pi / 180)
        centre = math.atan2(np.sin(angles).mean(), np.cos(angles).mean()) * 180 / (2 * math.pi)
        hue = int(round(centre + np.median((pixels[:, 0] - centre + 90) % 180 - 90))) % 180
        saturation, value = np.rint(np.median(pixels[:, 1:], axis=0)).astype(int)
        lower = [(hue - 10) % 180, max(25, int(saturation) - 70), max(25, int(value) - 70)]
        upper = [(hue + 10) % 180, 255, 255]
        index = self.sample_target
        self.bounds[index] = [lower, upper]
        self.clicks[index] = (x, y)
        for channel in range(3):
            for bound, suffix in enumerate(('min', 'max')):
                cv2.setTrackbarPos(f'{"HSV"[channel]} {suffix}', MASK_WINDOWS[index], self.bounds[index][bound][channel])
        bgr = tuple(map(int, np.rint(np.median(patch.reshape(-1, 3)[valid], axis=0))))
        print(f'{("BLUE", "GREEN")[index]} CLICK\npixel: x={x}, y={y}\n'
              f'BGR median: {bgr}\nHSV median: {(hue, int(saturation), int(value))}\n'
              f'range: lower {tuple(lower)} upper {tuple(upper)}')
        # Refresh masks immediately, independently of pair/area acceptance.
        full_hsv = cv2.cvtColor(self.debug_frame, cv2.COLOR_BGR2HSV)
        for window, bounds in zip(MASK_WINDOWS, self.bounds):
            cv2.imshow(window, self.detect(full_hsv, *bounds)[0])
        preview = self.debug_frame.copy()
        self.draw_clicks(preview)
        self.show_original(preview)
        self.sample_target = None

    def show_original(self, preview):
        # Never resize/crop/composite this dedicated mouse-calibration view.
        assert preview.shape == self.debug_frame.shape
        self.display_size = (preview.shape[1], preview.shape[0])
        cv2.imshow(DEBUG_IMAGE, preview)

    def draw_clicks(self, frame):
        for index, point in self.clicks.items():
            cv2.drawMarker(frame, point, (255, 255, 255), cv2.MARKER_CROSS, 13, 1)
            cv2.putText(frame, ('BLUE click', 'GREEN click')[index], (point[0]+8, point[1]-8),
                        cv2.FONT_HERSHEY_SIMPLEX, .4, (255, 255, 255), 1)

    def begin_calibration(self, now):
        self.calibrate_at = now + 3.0

    @staticmethod
    def detect(hsv, lower, upper):
        mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
        # H min > H max means a range crossing 179/0; S/V still use min <= max.
        if lower[0] > upper[0]:
            mask = (cv2.inRange(hsv, np.array([0, *lower[1:]]), np.array(upper))
                    | cv2.inRange(hsv, np.array(lower), np.array([179, *upper[1:]])))
        kernel = np.ones((3, 3), np.uint8)
        cleaned = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if MIN_AREA <= area <= mask.size * MAX_AREA_FRACTION:
                moments = cv2.moments(contour)
                centre = np.array((moments['m10'], moments['m01'])) / moments['m00']
                length = max(cv2.minAreaRect(contour)[1])
                candidates.append((centre, area, length, contour))
        return mask, candidates

    def select_pair(self, blue, green, shape):
        best, best_score = None, float('inf')
        rejected = set()
        self.pair_reason = ''
        diagonal = math.hypot(*shape[:2])
        for a in blue:
            for b in green:
                distance = np.linalg.norm(b[0] - a[0])
                ratio = max(a[1], b[1]) / min(a[1], b[1])
                patch_length = (a[2] + b[2]) / 2
                relative_separation = distance / max(patch_length, 1)
                if ratio > MAX_PAIR_AREA_RATIO:
                    rejected.add('SIZE RATIO')
                    continue
                if (not MIN_SEPARATION_PIXELS <= distance <= diagonal * .85
                        or not 2 <= relative_separation <= 20):
                    rejected.add('SEPARATION')
                    continue
                # Forty cm cannot be converted to pixels without scale. Compare it
                # with the visible ~5 cm tape length instead; no depth inference.
                score = abs(math.log(relative_separation / (MARKER_SEPARATION_METRES / PATCH_LENGTH_METRES)))
                score += math.log(ratio)
                if all(p is not None for p in self.points):
                    score += sum(np.linalg.norm(c[0] - p) for c, p in zip((a, b), self.points)) / diagonal
                if score < best_score:
                    best, best_score = (a[0], b[0]), score
        if best is not None:
            return best
        if rejected:
            self.pair_reason = 'PAIR REJECTED: ' + ' / '.join(sorted(rejected))
        # A lone current blob may support PARTIAL, but an incompatible pair cannot.
        if bool(blue) != bool(green):
            candidates = blue or green
            point = max(candidates, key=lambda c: c[1])[0]
            return (point, None) if blue else (None, point)
        return None, None

    def update(self, mirrored_frame, now):
        hsv = cv2.cvtColor(mirrored_frame, cv2.COLOR_BGR2HSV)
        if self.debug:
            for window, bounds in zip(MASK_WINDOWS, self.bounds):
                for channel in range(3):
                    for bound, suffix in enumerate(('min', 'max')):
                        bounds[bound][channel] = cv2.getTrackbarPos(f'{"HSV"[channel]} {suffix}', window)
        detections = [self.detect(hsv, *bounds) for bounds in self.bounds]
        a, b = self.select_pair(detections[0][1], detections[1][1], hsv.shape)
        missing = []
        for name, (mask, candidates) in zip(('BLUE', 'GREEN'), detections):
            if not candidates:
                missing.append(f'{name}: ' + ('AREA/NOISE FILTER' if np.any(mask) else 'COLOR MASK FAILED'))
        if missing:
            self.pair_reason = '; '.join(missing)
        self.points = (a, b)
        separation = np.linalg.norm(b - a) if a is not None and b is not None else 0
        state, speed, confidence = 'LOST', 0.0, 0.0
        if separation >= MIN_SEPARATION_PIXELS:
            recalibrate = self.reference is None or (
                self.calibrate_at is not None and now >= self.calibrate_at)
            if recalibrate:
                self.reference = a.copy()
                self.scale = MARKER_SEPARATION_METRES / separation
                self.calibrate_at = None
            delta = (a - self.reference) * self.scale
            position = BASE_HANDLE + (delta[0], -delta[1], 0)
            axis = np.array((b[0] - a[0], a[1] - b[1], 0)) / separation
            if not recalibrate and self.position is not None and self.last_seen is not None:
                elapsed = now - self.last_seen
                if 0 < elapsed <= LOSS_HOLD_SECONDS:
                    speed = float(np.linalg.norm(position - self.position) / elapsed)
            self.position, self.axis, self.last_seen = position, axis, now
            state, confidence = 'TRACKED', 1.0  # detection flag, not calibrated probability
        elif ((a is None) != (b is None)) and self.last_seen is not None:
            if now - self.last_seen <= LOSS_HOLD_SECONDS:
                state, confidence = 'PARTIAL', 0.5

        def vector(value):
            return None if value is None else dict(zip('xyz', map(float, value)))

        message = dict(type='bat', timestamp=now, state=state,
                    handlePosition=vector(self.position), axis=vector(self.axis),
                    speed=speed, confidence=confidence)
        if self.debug:
            self.debug_frame = mirrored_frame.copy()
            preview = self.debug_frame.copy()
            for window, (mask, candidates) in zip(MASK_WINDOWS, detections):
                cv2.imshow(window, mask)
                cv2.drawContours(preview, [c[3] for c in candidates], -1, (160, 160, 160), 1)
            self.draw(preview, message, now)
            self.draw_clicks(preview)
            prompt = ('1: BLUE A / 2: GREEN B, then click tape' if self.sample_target is None
                      else f'SELECT {("BLUE A", "GREEN B")[self.sample_target]}: click tape centre')
            cv2.putText(preview, prompt, (8, 20), cv2.FONT_HERSHEY_SIMPLEX, .5, (255, 255, 255), 1)
            self.show_original(preview)
        return message

    def draw(self, frame, message, now):
        a, b = self.points
        if message['state'] == 'LOST':
            a, b = None, None
        if a is not None and b is not None:
            cv2.line(frame, tuple(a.astype(int)), tuple(b.astype(int)), (255, 255, 255), 2)
        for label, point, color in [('BLUE A', a, (255, 120, 0)), ('GREEN B', b, (0, 255, 0))]:
            if point is not None:
                xy = tuple(point.astype(int))
                cv2.circle(frame, xy, 10, color, 2)
                cv2.putText(frame, label, (xy[0] + 12, xy[1]), cv2.FONT_HERSHEY_SIMPLEX, .7, color, 2)
        status = f"BAT MARKERS: {message['state']} | M: HSV | P: print HSV | C: re-centre"
        if self.calibrate_at is not None:
            status = f"MARKER CALIBRATION: {max(0, math.ceil(self.calibrate_at - now))} - show A+B side-on to camera"
        cv2.rectangle(frame, (0, frame.shape[0] - 32), (frame.shape[1], frame.shape[0]), (20, 20, 20), -1)
        cv2.putText(frame, status, (8, frame.shape[0] - 11), cv2.FONT_HERSHEY_SIMPLEX, .47, (255, 255, 255), 1)
        if self.pair_reason:
            cv2.putText(frame, self.pair_reason, (8, frame.shape[0] - 40),
                        cv2.FONT_HERSHEY_SIMPLEX, .45, (0, 180, 255), 1)
