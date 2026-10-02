"""Measure bounded compositing frames and click holds in an isolated Impress session."""
import json
import os
import signal
import subprocess
import sys
import time

import uno
from PIL import Image, ImageChops, ImageGrab


def interrupted(signum, frame):
    raise KeyboardInterrupt("Compositing probe interrupted")


signal.signal(signal.SIGTERM, interrupted)
source, folder = sys.argv[1:]
xvfb = subprocess.Popen(
    ["Xvfb", "-displayfd", "1", "-screen", "0", "1280x720x24", "-nolisten", "tcp"],
    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
)
office = None
try:
    display = ":" + xvfb.stdout.readline().decode().strip()
    pipe = "studio_frames_" + str(os.getpid())
    environment = {
        key: value for key, value in os.environ.items()
        if key not in ["WAYLAND_DISPLAY", "SESSION_MANAGER"]
    }
    environment.update({
        "DISPLAY": display, "SAL_USE_VCLPLUGIN": "gen",
        "GDK_BACKEND": "x11", "XDG_SESSION_TYPE": "x11",
    })
    office = subprocess.Popen(
        ["libreoffice", "-env:UserInstallation=" + uno.systemPathToFileUrl(folder + "/frames-profile"),
         "--norestore", "--nofirststartwizard", "--accept=pipe,name=" + pipe + ";urp;StarOffice.ComponentContext"],
        env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
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
        raise RuntimeError("Impress did not initialize its frame probe.")
    desktop = context.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", context)
    document = desktop.loadComponentFromURL(uno.systemPathToFileUrl(source), "_blank", 0, ())
    time.sleep(0.8)
    pdf_option = uno.createUnoStruct("com.sun.star.beans.PropertyValue")
    pdf_option.Name, pdf_option.Value = "FilterName", "impress_pdf_Export"
    document.storeToURL(uno.systemPathToFileUrl(folder + "/frame-print.pdf"), (pdf_option,))
    subprocess.run(["pdftoppm", "-png", "-r", "96", folder + "/frame-print.pdf", folder + "/frame-print"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
    presentation = document.getPresentation()
    presentation.start()
    controller = None
    for attempt in range(100):
        controller = presentation.getController()
        if controller is not None:
            break
        time.sleep(0.1)
    if controller is None:
        raise RuntimeError("Impress did not initialize its slideshow controller.")
    time.sleep(0.2)

    def sample():
        image = ImageGrab.grab(xdisplay=display).convert("RGB")
        red, green, blue = image.split()
        result = {"redPixel": image.getpixel((280, 200)), "bluePixel": image.getpixel((500, 330))}
        for name, main, other in [("red", red, ImageChops.lighter(green, blue)), ("blue", blue, ImageChops.lighter(red, green))]:
            mask = ImageChops.subtract(main, other).point(lambda value: 255 if value > 60 else 0)
            result[name] = {"pixels": mask.histogram()[255], "bounds": mask.getbbox()}
            if name == "blue":
                result["nativeBlue"] = mask.crop((0, 550, 1280, 720)).getbbox()
        return result

    def click_samples():
        controller.gotoNextEffect()
        start = time.monotonic()
        samples = []
        for target in [0.15, 0.35, 0.6, 1.0, 1.35, 1.85]:
            time.sleep(max(0, start + target - time.monotonic()))
            samples.append({"time": round(time.monotonic() - start, 3), **sample()})
        return samples

    results = []
    for index in range(document.DrawPages.Count):
        controller.gotoSlideIndex(index)
        time.sleep(0.2)
        result = {"before": sample(), "first": click_samples()}
        printed = Image.open(folder + "/frame-print-" + str(index + 1) + ".png").convert("RGB")
        result["printed"] = {"blueBase": printed.getpixel((190, 150)), "redTail": printed.getpixel((310, 150))}
        if index in [1, 3]:
            result["second"] = click_samples()
        ImageGrab.grab(xdisplay=display).save(folder + "/frames-final-" + str(index) + ".png")
        results.append(result)
    print(json.dumps(results), flush=True)
    presentation.end()
    document.dispose()
    desktop.terminate()
finally:
    if office is not None:
        office.terminate()
        try:
            office.wait(timeout=5)
        except subprocess.TimeoutExpired:
            office.kill()
            office.wait(timeout=5)
    xvfb.terminate()
    try:
        xvfb.wait(timeout=5)
    except subprocess.TimeoutExpired:
        xvfb.kill()
        xvfb.wait(timeout=5)
