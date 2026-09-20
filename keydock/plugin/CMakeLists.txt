# KeyDock VST3 analyser plugin.
#
# JUCE is fetched at configure time. Pin the tag rather than tracking a branch
# so a build is reproducible. See docs/06-lizenzen.md for the licence terms
# this choice commits you to.
include(FetchContent)

set(KEYDOCK_JUCE_TAG "8.0.8" CACHE STRING "JUCE git tag to build against")

FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        ${KEYDOCK_JUCE_TAG}
    GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(JUCE)

juce_add_plugin(KeyDockPlugin
    PLUGIN_NAME                 "KeyDock"
    PRODUCT_NAME                "KeyDock"
    COMPANY_NAME                "KeyDock"
    BUNDLE_ID                   "com.keydock.analyser"
    PLUGIN_MANUFACTURER_CODE    Kdck
    PLUGIN_CODE                 Kdk1
    FORMATS                     VST3
    VST3_CATEGORIES             "Analyzer" "Fx"
    IS_SYNTH                    FALSE
    NEEDS_MIDI_INPUT            FALSE
    NEEDS_MIDI_OUTPUT           FALSE
    IS_MIDI_EFFECT              FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD     FALSE)

target_sources(KeyDockPlugin PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
    Source/AnalysisController.cpp
    Source/SampleEditor.cpp
    Source/IpcClient.cpp
    Source/OverlayLauncher.cpp)

target_compile_definitions(KeyDockPlugin PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0)

if (WIN32)
    # Same reason as the overlay: keep the windows.h min/max macros out.
    target_compile_definitions(KeyDockPlugin PUBLIC NOMINMAX)
endif()

if (MSVC)
    # /utf-8: the sources are UTF-8 without a BOM, which MSVC would otherwise
    # decode using the system code page - German labels would become mojibake.
    target_compile_options(KeyDockPlugin PRIVATE /utf-8)
endif()

target_include_directories(KeyDockPlugin PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/Source
    ${CMAKE_SOURCE_DIR}/shared)

target_link_libraries(KeyDockPlugin
    PRIVATE
        keydock_engine
        juce::juce_audio_utils
        juce::juce_audio_processors
        juce::juce_gui_basics
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)
