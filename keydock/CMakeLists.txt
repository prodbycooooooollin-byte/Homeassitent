cmake_minimum_required(VERSION 3.22)

project(KeyDock VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(KEYDOCK_BUILD_ENGINE_TESTS "Build the platform-independent engine tests" ON)
option(KEYDOCK_BUILD_PLUGIN       "Build the VST3 analyser plugin (needs JUCE)" OFF)
option(KEYDOCK_BUILD_OVERLAY      "Build the Windows overlay companion app"     OFF)

if (WIN32)
    # The overlay and the plugin only make sense together on Windows.
    set(KEYDOCK_BUILD_PLUGIN  ON CACHE BOOL "" FORCE)
    set(KEYDOCK_BUILD_OVERLAY ON CACHE BOOL "" FORCE)
endif()

add_subdirectory(engine)

if (KEYDOCK_BUILD_ENGINE_TESTS)
    enable_testing()
    add_subdirectory(engine/tests)
endif()

if (KEYDOCK_BUILD_PLUGIN)
    add_subdirectory(plugin)
endif()

if (KEYDOCK_BUILD_OVERLAY)
    add_subdirectory(overlay)
endif()
