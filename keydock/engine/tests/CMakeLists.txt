add_executable(keydock_engine_tests
    TestSignals.cpp
    EngineTests.cpp)

target_link_libraries(keydock_engine_tests PRIVATE keydock_engine)
target_compile_features(keydock_engine_tests PRIVATE cxx_std_17)

add_test(NAME keydock_engine_tests COMMAND keydock_engine_tests)
