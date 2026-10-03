add_executable(keydock_engine_tests
    TestSignals.cpp
    EngineTests.cpp)

target_link_libraries(keydock_engine_tests PRIVATE keydock_engine)
target_compile_features(keydock_engine_tests PRIVATE cxx_std_17)

add_test(NAME keydock_engine_tests COMMAND keydock_engine_tests)

# The capture state machine is JUCE-free on purpose, so it can be tested here.
add_executable(keydock_controller_tests
    TestSignals.cpp
    ControllerTests.cpp
    ${CMAKE_SOURCE_DIR}/plugin/Source/AnalysisController.cpp)

target_include_directories(keydock_controller_tests PRIVATE
    ${CMAKE_SOURCE_DIR}/plugin/Source)

target_link_libraries(keydock_controller_tests PRIVATE keydock_engine)
target_compile_features(keydock_controller_tests PRIVATE cxx_std_17)

find_package(Threads REQUIRED)
target_link_libraries(keydock_controller_tests PRIVATE Threads::Threads)

add_test(NAME keydock_controller_tests COMMAND keydock_controller_tests)
