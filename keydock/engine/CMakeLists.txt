add_library(keydock_engine STATIC
    src/Types.cpp
    src/Fft.cpp
    src/Resampler.cpp
    src/KeyDetector.cpp
    src/TempoDetector.cpp
    src/AnalysisEngine.cpp)

target_include_directories(keydock_engine
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
        ${CMAKE_SOURCE_DIR}/shared)

target_compile_features(keydock_engine PUBLIC cxx_std_17)

if (MSVC)
    target_compile_options(keydock_engine PRIVATE /W4 /fp:fast)
else()
    target_compile_options(keydock_engine PRIVATE -Wall -Wextra -ffast-math)
endif()
