# Basin Capture

## 必要なソフトウェア

- libpcap-devel
- openssl-devel
- make
- gcc-c++
- [boost](https://www.boost.org/) >= 1.67.0
- [CMake](https://cmake.org/) >= 2.12.0


## ビルド方法

```Shell
# Clone repo
git clone https://github.com/fujita-h/Basin.git
cd Basin/Capture

# Init and update submodules
git submodule update -i

# Create build directory
mkdir build
cd build/

# Configure
cmake ../

# Compile
make
```


### [Optional] CMake をソースからインストールするには

ディストリビューションによっては、パッケージマネージャの CMake が古く、Capture をビルドできない場合があります。その際は、ソースからインストールして下さい。  

```Shell
wget https://github.com/Kitware/CMake/releases/download/v3.17.3/cmake-3.17.3.tar.gz
tar zxf cmake-3.17.3.tar.gz
cd cmake-3.17.3/
./bootstrap
make
make install
```

### [Optional] boost をソースからインストールするには

ディストリビューションによっては、パッケージマネージャの boost が古く、Capture をビルドできない場合があります。その際は、ソースからインストールして下さい。  

```Shell
wget https://dl.bintray.com/boostorg/release/1.73.0/source/boost_1_73_0.tar.gz
tar zxf boost_1_73_0.tar.gz
cd boost_1_73_0
./bootstrap.sh
./b2 install
```
