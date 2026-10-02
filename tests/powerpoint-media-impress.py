"""Observe real media playback and an editable build in an isolated Impress window."""

import ctypes
import ctypes.util
import json
import os
import signal
import subprocess
import sys
import time

import uno
from PIL import Image, ImageGrab


def interrupted(signum, frame):
    raise KeyboardInterrupt("Media playback probe interrupted")


signal.signal(signal.SIGTERM, interrupted)
source, folder = sys.argv[1:3]
manual = "--manual" in sys.argv[3:]
binary = os.environ.get("STUDIO_TEST_MEDIA_SOFFICE", "libreoffice")
version = subprocess.check_output(
    [binary, "--version"], text=True, timeout=10
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
            binary,
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
    print_rgb = None
    if manual:
        option = uno.createUnoStruct("com.sun.star.beans.PropertyValue")
        option.Name, option.Value = "FilterName", "impress_pdf_Export"
        document.storeToURL(uno.systemPathToFileUrl(folder + "/media.pdf"), (option,))
        subprocess.run(
            ["pdftoppm", "-f", "2", "-singlefile", "-scale-to-x", "1280",
             "-scale-to-y", "720", "-png", folder + "/media.pdf", folder + "/media-print"],
            check=True, timeout=10, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        print_rgb = list(Image.open(folder + "/media-print.png").convert("RGB").getpixel((600, 330)))
    time.sleep(0.8)
    presentation = document.getPresentation()
    presentation.start()
    controller = None
    deadline = time.monotonic() + 10
    while controller is None and time.monotonic() < deadline:
        controller = presentation.getController()
        if controller is None:
            time.sleep(0.05)
    if controller is None:
        raise RuntimeError("Impress did not initialize its slideshow controller within 10 seconds.")
    controller.gotoSlideIndex(1)
    def observe(count, hold_cover=False):
        start = time.monotonic()
        samples = []
        cover_time = None
        for index in range(count):
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
            if hold_cover:
                red, _, blue = samples[-1]["video"]
                if cover_time is None and red > 200 and blue < 30:
                    cover_time = time.monotonic()
                if cover_time is not None and time.monotonic() - cover_time > 2.2:
                    break
        return samples, image

    samples, image = observe(100 if manual else 65, hold_cover=manual)
    result = {"version": version, "samples": samples}
    if manual:
        image.save(folder + "/media-before-click.png")
        x11 = ctypes.CDLL(ctypes.util.find_library("X11"))
        xtst = ctypes.CDLL(ctypes.util.find_library("Xtst"))
        x11.XOpenDisplay.argtypes, x11.XOpenDisplay.restype = [ctypes.c_char_p], ctypes.c_void_p
        connection = x11.XOpenDisplay(display.encode())
        if not connection:
            raise RuntimeError("The media test could not connect its native mouse.")
        xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
        xtst.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
        x11.XFlush.argtypes = [ctypes.c_void_p]
        x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
        xtst.XTestFakeMotionEvent(connection, -1, 600, 330, 0)
        xtst.XTestFakeButtonEvent(connection, 1, 1, 0)
        xtst.XTestFakeButtonEvent(connection, 1, 0, 0)
        x11.XFlush(connection)
        x11.XCloseDisplay(connection)
        result["after"], image = observe(45)
        result["printRGB"] = print_rgb
    image.save(folder + "/media-playback-finished.png")
    presentation.end()
    document.dispose()
    desktop.terminate()
    print(json.dumps(result))
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
