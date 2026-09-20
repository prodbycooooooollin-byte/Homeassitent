add_executable(keydock-analyze
    main.cpp
    WavReader.cpp)

target_link_libraries(keydock-analyze PRIVATE keydock_engine)
target_compile_features(keydock-analyze PRIVATE cxx_std_17)

if (MSVC)
    target_compile_options(keydock-analyze PRIVATE /W4)
else()
    target_compile_options(keydock-analyze PRIVATE -Wall -Wextra)
endif()
