add_executable(KeyDockOverlay WIN32
    src/main.cpp
    src/OverlayWindow.cpp
    src/OverlayRender.cpp
    src/HostTracker.cpp
    src/IpcServer.cpp
    src/Settings.cpp
    src/TempoBridge.cpp)

target_include_directories(KeyDockOverlay PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${CMAKE_SOURCE_DIR}/shared)

target_link_libraries(KeyDockOverlay PRIVATE
    keydock_engine
    user32 gdi32 shell32 psapi dwmapi winmm)

target_compile_features(KeyDockOverlay PRIVATE cxx_std_17)

# Belt and braces alongside the per-file guards: nothing in this target may
# ever see the windows.h min/max macros.
target_compile_definitions(KeyDockOverlay PRIVATE
    NOMINMAX
    WIN32_LEAN_AND_MEAN)

if (MSVC)
    # /utf-8: the sources are UTF-8 without a BOM, which MSVC would
    # otherwise decode using the system code page.
    target_compile_options(KeyDockOverlay PRIVATE /W4 /utf-8)
    # Per-monitor DPI v2 and a modern common-controls manifest.
    set_target_properties(KeyDockOverlay PROPERTIES
        LINK_FLAGS "/MANIFESTUAC:\"level='asInvoker' uiAccess='false'\"")
else()
    target_compile_options(KeyDockOverlay PRIVATE -Wall -Wextra)
endif()

set_target_properties(KeyDockOverlay PROPERTIES OUTPUT_NAME "KeyDockOverlay")
