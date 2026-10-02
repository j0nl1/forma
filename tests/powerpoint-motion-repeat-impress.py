"""Observe native composed repeat resets with real Impress pixels."""
import json
import os
import subprocess
import sys
import time
from threading import Event

import uno
from unohelper import Base
from com.sun.star.presentation import XSlideShowListener
from PIL import ImageChops, ImageGrab


class Completion(Base, XSlideShowListener):
    def __init__(self):
        self.ended = Event()

    def slideAnimationsEnded(self):
        self.ended.set()

    def disposing(self, event): pass
    def beginEvent(self, node): pass
    def endEvent(self, node): pass
    def repeat(self, node, iteration): pass
    def paused(self): pass
    def resumed(self): pass
    def slideTransitionStarted(self): pass
    def slideTransitionEnded(self): pass
    def slideEnded(self, reverse): pass
    def hyperLinkClicked(self, link): pass


source, folder = sys.argv[1:]
xvfb = subprocess.Popen(
    ["Xvfb", "-displayfd", "1", "-screen", "0", "1280x720x24", "-nolisten", "tcp"],
    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
)
office = None
try:
    display = ":" + xvfb.stdout.readline().decode().strip()
    pipe = "studio_repeat_" + str(os.getpid())
    office = subprocess.Popen(
        ["libreoffice", "-env:UserInstallation=" + uno.systemPathToFileUrl(folder + "/repeat-profile"),
         "--norestore", "--nofirststartwizard", "--accept=pipe,name=" + pipe + ";urp;StarOffice.ComponentContext"],
        env={**os.environ, "DISPLAY": display, "SAL_USE_VCLPLUGIN": "gen"},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
    context = None
    for attempt in range(100):
        try:
            context = resolver.resolve("uno:pipe,name=" + pipe + ";urp;StarOffice.ComponentContext")
            break
        except Exception:
            time.sleep(0.1)
    if context is None:
        raise RuntimeError("Impress did not initialize")
    desktop = context.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", context)
    document = desktop.loadComponentFromURL(uno.systemPathToFileUrl(source), "_blank", 0, ())
    time.sleep(2)
    presentation = document.getPresentation()
    presentation.start()
    time.sleep(2)
    controller = presentation.getController()
    completion = Completion()
    controller.addSlideShowListener(completion)

    def geometry():
        image = ImageGrab.grab(xdisplay=display).convert("RGB")
        red, green, blue = image.split()
        red_mask = ImageChops.subtract(red, blue).point(lambda value: 255 if value > 100 else 0)
        blue_mask = ImageChops.subtract(blue, red).point(lambda value: 255 if value > 100 else 0)
        return {"red": red_mask.getbbox(), "blue": blue_mask.getbbox()}

    results = []
    for index in range(4):
        controller.gotoSlideIndex(index)
        time.sleep(0.12)
        before = geometry()
        completion.ended.clear()
        started = time.monotonic()
        controller.gotoNextEffect()
        frames = []
        while True:
            sample = {"elapsed": time.monotonic()-started, **geometry()}
            frames.append(sample)
            if index == 3:
                first_ended = sample["red"] and sample["red"][0] >= 357 and sample["elapsed"] >= 1.6
            else:
                first_ended = completion.ended.is_set()
            if first_ended:
                break
            if sample["elapsed"] > 5:
                with open(folder + "/repeat-observations.json", "w") as output:
                    json.dump(results + [{"before": before, "frames": frames, "timeout": True}], output)
                raise RuntimeError("The composed repeat did not finish on slide " + str(index))
            time.sleep(0.025)
        first = geometry()
        second = None
        if index == 3:
            completion.ended.clear()
            controller.gotoNextEffect()
            if not completion.ended.wait(3):
                raise RuntimeError("The second click did not finish")
            second = geometry()
        ImageGrab.grab(xdisplay=display).save(folder + "/repeat-" + str(index) + "-finished.png")
        results.append({"before": before, "frames": frames, "first": first, "second": second})
        with open(folder + "/repeat-observations.json", "w") as output:
            json.dump(results, output)
    presentation.end()
    document.close(True)
    desktop.terminate()
    print(json.dumps(results))
finally:
    if office is not None:
        office.terminate()
        try:
            office.wait(timeout=5)
        except subprocess.TimeoutExpired:
            office.kill()
    xvfb.terminate()
    xvfb.wait(timeout=5)
