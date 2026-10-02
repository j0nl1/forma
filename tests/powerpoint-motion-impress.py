"""Optional real Impress playback probe, isolated in the caller's temporary directory."""

import json
import os
import subprocess
import sys
import time

import uno
from PIL import ImageChops, ImageGrab


source, folder, all_source, names_json = sys.argv[1:]
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
    samples["finished"] = capture("finished")
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
        controller.gotoNextEffect()
        time.sleep(0.14)
        first = geometry()
        time.sleep(0.14)
        second = geometry()
        time.sleep(0.25)
        after = geometry(before["bounds"])
        samples["effects"].append(
            {"effect": name, "before": before, "middle": [first, second], "after": after}
        )
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
