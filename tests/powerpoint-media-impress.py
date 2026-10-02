"""Observe real media playback and an editable build in an isolated Impress window."""

import json
import os
import signal
import subprocess
import sys
import time

import uno
from PIL import ImageGrab


def interrupted(signum, frame):
    raise KeyboardInterrupt("Media playback probe interrupted")


signal.signal(signal.SIGTERM, interrupted)
source, folder = sys.argv[1:]
version = subprocess.check_output(
    ["libreoffice", "--version"], text=True, timeout=10
).strip()
xvfb = subprocess.Popen(
    ["Xvfb", "-displayfd", "1", "-screen", "0", "1280x720x24", "-nolisten", "tcp"],
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
)
office = None
try:
    display = ":" + xvfb.stdout.readline().decode().strip()
    pipe_name = "studio_media_" + str(os.getpid())
    environment = {
        key: value
        for key, value in os.environ.items()
        if key not in ["WAYLAND_DISPLAY", "SESSION_MANAGER"]
    }
    environment.update({
        "DISPLAY": display,
        "SAL_USE_VCLPLUGIN": "gen",
        "GST_AUDIO_SINK": "fakesink",
        "GST_GL_WINDOW": "x11",
        "GST_GL_PLATFORM": "glx",
        "GDK_BACKEND": "x11",
        "XDG_SESSION_TYPE": "x11",
    })
    office = subprocess.Popen(
        [
            "libreoffice",
            "-env:UserInstallation=" + uno.systemPathToFileUrl(folder + "/media-profile"),
            "--norestore",
            "--nofirststartwizard",
            "--accept=pipe,name=" + pipe_name + ";urp;StarOffice.ComponentContext",
        ],
        env=environment,
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
        raise RuntimeError("Impress did not initialize its media test connection.")
    desktop = context.ServiceManager.createInstanceWithContext(
        "com.sun.star.frame.Desktop", context
    )
    document = desktop.loadComponentFromURL(
        uno.systemPathToFileUrl(source), "_blank", 0, ()
    )
    time.sleep(0.8)
    presentation = document.getPresentation()
    presentation.start()
    time.sleep(0.8)
    controller = presentation.getController()
    controller.gotoSlideIndex(1)
    start = time.monotonic()
    samples = []
    for index in range(65):
        time.sleep(max(0, start + index * 0.06 - time.monotonic()))
        image = ImageGrab.grab(xdisplay=display).convert("RGB")
        white_pixels = sum(
            1 for red, green, blue in image.crop((25, 25, 650, 110)).getdata()
            if red > 180 and green > 180 and blue > 180
        )
        samples.append({
            "time": round(time.monotonic() - start, 3),
            "video": list(image.getpixel((600, 330))),
            "background": list(image.getpixel((1100, 650))),
            "headingWhitePixels": white_pixels,
        })
    image.save(folder + "/media-playback-finished.png")
    presentation.end()
    document.dispose()
    desktop.terminate()
    print(json.dumps({"version": version, "samples": samples}))
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
