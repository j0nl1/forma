"""Optional real Impress playback probe, isolated in the caller's temporary directory."""

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


class AnimationCompletion(Base, XSlideShowListener):
    """Observe the actual end of a slide's main animation sequence."""

    def __init__(self):
        self.ended = Event()

    def slideAnimationsEnded(self):
        self.ended.set()

    def await_end(self, label):
        if not self.ended.wait(3):
            raise RuntimeError("Impress did not finish the animation: " + label)

    def disposing(self, event):
        pass

    def beginEvent(self, node):
        pass

    def endEvent(self, node):
        pass

    def repeat(self, node, iteration):
        pass

    def paused(self):
        pass

    def resumed(self):
        pass

    def slideTransitionStarted(self):
        pass

    def slideTransitionEnded(self):
        pass

    def slideEnded(self, reverse):
        pass

    def hyperLinkClicked(self, link):
        pass


source, folder, all_source, names_json, affine_source, expected_json = sys.argv[1:]
xvfb = subprocess.Popen(
    ["Xvfb", "-displayfd", "1", "-screen", "0", "1280x720x24", "-nolisten", "tcp"],
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
)
office = None
try:
    display = ":" + xvfb.stdout.readline().decode().strip()
    pipe_name = "studio_motion_" + str(os.getpid())
    office = subprocess.Popen(
        [
            "libreoffice",
            "-env:UserInstallation=" + uno.systemPathToFileUrl(folder + "/playback-profile"),
            "--norestore",
            "--nofirststartwizard",
            "--accept=pipe,name=" + pipe_name + ";urp;StarOffice.ComponentContext",
        ],
        env={**os.environ, "DISPLAY": display, "SAL_USE_VCLPLUGIN": "gen"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local
    )
    context = None
    for attempt in range(100):
        try:
            context = resolver.resolve(
                "uno:pipe,name=" + pipe_name + ";urp;StarOffice.ComponentContext"
            )
            break
        except Exception:
            time.sleep(0.1)
    if context is None:
        raise RuntimeError("Impress did not initialize its test connection.")
    desktop = context.ServiceManager.createInstanceWithContext(
        "com.sun.star.frame.Desktop", context
    )
    document = desktop.loadComponentFromURL(
        uno.systemPathToFileUrl(source), "_blank", 0, ()
    )
    # Loading completes before the native window is painted. Let the application
    # settle before opening its slideshow so the first frame is meaningful.
    time.sleep(2)
    presentation = document.getPresentation()
    presentation.start()
    time.sleep(2)
    controller = presentation.getController()
    completion = AnimationCompletion()
    controller.addSlideShowListener(completion)

    def capture(name):
        image = ImageGrab.grab(xdisplay=display)
        image.save(folder + "/" + name + ".png")
        return [list(image.getpixel((x, 150))) for x in [150, 450, 750, 1050]]

    samples = {"initial": capture("initial")}
    controller.gotoNextEffect()
    time.sleep(0.15)
    samples["early"] = capture("early")
    time.sleep(0.3)
    samples["middle"] = capture("middle")
    time.sleep(0.5)
    completion.await_end("click/with/after sequence")
    samples["finished"] = capture("finished")
    completion.ended.clear()
    controller.gotoSlideIndex(1)
    time.sleep(0.8)
    repeated = ImageGrab.grab(xdisplay=display)
    pixels = repeated.load()
    occupied = [x for x in range(850) if pixels[x, 150][2] - pixels[x, 150][0] > 30]
    samples["repeat-middle"] = {
        "left": min(occupied),
        "marker": list(pixels[1050, 150]),
    }
    time.sleep(0.65)
    completion.await_end("repeated reverse path")
    samples["repeat-finished"] = capture("repeat-finished")
    presentation.end()
    document.close(True)
    document = desktop.loadComponentFromURL(
        uno.systemPathToFileUrl(all_source), "_blank", 0, ()
    )
    time.sleep(2)
    presentation = document.getPresentation()
    presentation.start()
    time.sleep(2)
    controller = presentation.getController()
    completion = AnimationCompletion()
    controller.addSlideShowListener(completion)

    def geometry(interior_bounds=None):
        image = ImageGrab.grab(xdisplay=display).convert("RGB")
        red, green, blue = image.split()
        colored = ImageChops.lighter(
            ImageChops.subtract(green, red), ImageChops.subtract(blue, red)
        ).point(lambda value: 255 if value > 30 else 0)
        result = {"pixels": colored.histogram()[255], "bounds": colored.getbbox()}
        if interior_bounds:
            left, top, right, bottom = interior_bounds
            result["interiorPixels"] = colored.crop(
                (left + 1, top + 1, right - 1, bottom - 1)
            ).histogram()[255]
        return result

    samples["effects"] = []
    for index, name in enumerate(json.loads(names_json)):
        controller.gotoSlideIndex(index)
        time.sleep(0.12)
        before = geometry()
        completion.ended.clear()
        controller.gotoNextEffect()
        time.sleep(0.14)
        first = geometry()
        time.sleep(0.14)
        second = geometry()
        time.sleep(0.25)
        repeat_middle = geometry() if name == "box-out" else None
        if repeat_middle is not None:
            time.sleep(0.4)
        completion.await_end(name)
        after = geometry(before["bounds"])
        samples["effects"].append(
            {"effect": name, "before": before, "middle": [first, second],
             "repeatMiddle": repeat_middle, "after": after}
        )
    presentation.end()
    document.close(True)
    document = desktop.loadComponentFromURL(
        uno.systemPathToFileUrl(affine_source), "_blank", 0, ()
    )
    time.sleep(2)
    presentation = document.getPresentation()
    presentation.start()
    time.sleep(2)
    controller = presentation.getController()
    completion = AnimationCompletion()
    controller.addSlideShowListener(completion)

    def blue_bounds(label):
        image = ImageGrab.grab(xdisplay=display).convert("RGB")
        image.save(folder + "/affine-" + label + ".png")
        red, green, blue = image.split()
        mask = ImageChops.subtract(blue, red).point(
            lambda value: 255 if value > 80 else 0
        )
        return mask.getbbox()

    samples["affine"] = []
    for index, expected in enumerate(json.loads(expected_json)):
        controller.gotoSlideIndex(index)
        time.sleep(0.12)
        before = blue_bounds(str(index) + "-before")
        completion.ended.clear()
        controller.gotoNextEffect()
        time.sleep(0.25)
        middle = blue_bounds(str(index) + "-middle")
        if len(expected["steps"]) > 1:
            # A later click keeps the main sequence open. Observe this monotonic
            # path reaching its rendered endpoint before sending that click.
            deadline = time.monotonic() + 3
            while True:
                first = blue_bounds(str(index) + "-first")
                if first and all(abs(a-b) <= 2 for a, b in zip(first, expected["steps"][0])):
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError("The first composed click did not reach its endpoint")
                time.sleep(0.03)
            completion.ended.clear()
            controller.gotoNextEffect()
            completion.await_end("second composed click")
            second = blue_bounds(str(index) + "-second")
        else:
            completion.await_end("affine slide " + str(index))
            first = blue_bounds(str(index) + "-first")
            second = None
        samples["affine"].append({"before": before, "middle": middle, "first": first, "second": second})
    presentation.end()
    document.close(True)
    desktop.terminate()
    print(json.dumps(samples))
finally:
    if office is not None:
        office.terminate()
        try:
            office.wait(timeout=5)
        except subprocess.TimeoutExpired:
            office.kill()
    xvfb.terminate()
    xvfb.wait(timeout=5)
