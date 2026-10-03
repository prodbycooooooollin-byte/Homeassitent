add_executable(keydock-analyze
    main.cpp
    WavReader.cpp)

target_link_libraries(keydock-analyze PRIVATE keydock_engine)
target_compile_features(keydock-analyze PRIVATE cxx_std_17)

if (MSVC)
    # /utf-8: the sources are UTF-8 without a BOM, which MSVC would
    # otherwise decode using the system code page.
    target_compile_options(keydock-analyze PRIVATE /W4 /utf-8)
else()
    target_compile_options(keydock-analyze PRIVATE -Wall -Wextra)
endif()
