# Basin Capture

## Requirements

- libpcap-devel
- openssl-devel
- [boost](https://www.boost.org/) >= 1.67.0
- [CMake](https://cmake.org/) >= 2.12.0


## Build Capture

```Shell
# Create build directory
mkdir build
cd build/

# Configure
cmake ../

# Compile
make
```


### How to install CMake from source

If your system does not have the required CMake, you can install it from source.

```Shell
wget https://github.com/Kitware/CMake/releases/download/v3.17.3/cmake-3.17.3.tar.gz
tar zxf cmake-3.17.3.tar.gz
cd cmake-3.17.3/
./bootstrap
make
make install
```

### How to install boost from source

If your system does not have the required boost, you can install it from source.

```Shell
wget https://dl.bintray.com/boostorg/release/1.73.0/source/boost_1_73_0.tar.gz
tar zxf boost_1_73_0.tar.gz
cd boost_1_73_0
./bootstrap.sh
./b2 install
```
