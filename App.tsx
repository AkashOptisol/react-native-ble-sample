import React, {useEffect, useRef, useState} from 'react';
import {
  Button,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import {
  BleErrorCode,
  BleManager,
  Device,
  State,
  Subscription,
} from 'react-native-ble-plx';
import {requestMultiple, PERMISSIONS} from 'react-native-permissions';
import Header from './src/components/Header';
import BleModule from './src/utils/BleModule';
import Characteristic from './src/components/Characteristic';

const bleModule = new BleModule();
const manager = new BleManager();

const App = () => {
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [services, setServices] = useState([]);
  const [characteristics, setCharacteristics] = useState({});
  const [selectedService, setSelectedService] = useState(null);
  const [showReadModal, setShowReadModal] = useState(false);
  const [showWriteModal, setShowWriteModal] = useState(false);
  const [writeValue, setWriteValue] = useState('');
  const [selectedCharacteristic, setSelectedCharacteristic] = useState(null);

  const [isConnected, setIsConnected] = useState(false);
  const [scaning, setScaning] = useState(false);
  const [connectingId, setConnectingId] = useState('');
  const deviceMap = useRef(new Map<string, Device>());
  const [data, setData] = useState<Device[]>([]);
  const [writeData, setWriteData] = useState('');
  const [receiveData, setReceiveData] = useState('');
  const [inputText, setInputText] = useState('');
  const [readData, setReadData] = useState('');
  const scanTimer = useRef<number>();
  const disconnectListener = useRef<Subscription>();
  const monitorListener = useRef<Subscription>();

  useEffect(() => {
    requestPermissions();
  }, []);

  useEffect(() => {
    const stateChangeListener = bleModule.manager.onStateChange(state => {
      console.log('onStateChange: ', state);
      if (state == State.PoweredOn) {
        scan();
      }
    });

    return () => {
      stateChangeListener?.remove();
      disconnectListener.current?.remove();
      monitorListener.current?.remove();
    };
  }, []);

  const requestPermissions = async () => {
    await requestMultiple([
      PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
      PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
      PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
    ]);
  };

  // const scanForDevices = () => {
  //   setDevices([]);
  //   manager.startDeviceScan(null, null, (error, device) => {
  //     if (error) {
  //       console.log(error);
  //       return;
  //     }
  //     setDevices(prevDevices => {
  //       if (prevDevices.find(d => d.id === device.id)) {
  //         return prevDevices;
  //       }
  //       return [...prevDevices, device];
  //     });
  //   });

  //   // Stop scanning after 10 seconds
  //   setTimeout(() => {
  //     manager.stopDeviceScan();
  //   }, 10000);
  // };

  const connectToDevice = async device => {
    try {
      if (scaning) {
        bleModule.stopScan();
        setScaning(false);
      }

      setConnectingId(device.id);
      const connected = await manager.connectToDevice(device.id);
      setConnectedDevice(connected);
      setData([device]);
      setIsConnected(true);
      onDisconnect();
      setConnectingId('');
      const discoveredServices =
        await connected.discoverAllServicesAndCharacteristics();
      const services = await discoveredServices.services();
      setServices(services);
    } catch (error) {
      console.log('Connection error', error);
    }
  };

  const fetchCharacteristicsForService = async service => {
    try {
      setSelectedService(service.uuid); // Set the selected service
      const serviceCharacteristics = await service.characteristics();
      setCharacteristics(prev => ({
        ...prev,
        [service.uuid]: serviceCharacteristics,
      }));
    } catch (error) {
      console.log('Error fetching characteristics', error);
    }
  };

  const groupCharacteristics = characteristics => {
    const readCharacteristics = characteristics.filter(char => char.isReadable);
    const writeCharacteristics = characteristics.filter(
      char => char.isWritableWithResponse,
    );
    const notifyCharacteristics = characteristics.filter(
      char => char.isNotifiable,
    );
    return {readCharacteristics, writeCharacteristics, notifyCharacteristics};
  };

  // Manual String to Hex conversion
  const convertASCII_to_HEX = inputString => {
    return Array.from(inputString)
      .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('');
  };

  // Manual Hex to String conversion
  const convertHEX_to_ASCII = hexValue => {
    let str = '';
    for (let i = 0; i < hexValue.length; i += 2) {
      const charCode = parseInt(hexValue.substr(i, 2), 16);
      str += String.fromCharCode(charCode);
    }
    return str;
  };
  // HEX to Bytes
  function hexToBytes(hex) {
    const byteArray = hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16));
    return byteArray;
  }
  // Byte Array to Base64
  function byteArrayToBase64(byteArray) {
    const binaryString = Array.from(byteArray, byte =>
      String.fromCharCode(byte),
    ).join('');
    return btoa(binaryString);
  }

  const base64ToByteArray = (base64String: string) => {
    const binaryString = atob(base64String);
    const byteArray = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      byteArray[i] = binaryString.charCodeAt(i);
    }
    let hexString = Array.from(byteArray, byte =>
      byte.toString(16).padStart(2, '0'),
    ).join('');

    return hexString;
  };
  const readCharacteristic = async characteristic => {
    try {
      const value = await manager.readCharacteristicForDevice(
        connectedDevice.id,
        selectedService,
        characteristic.uuid,
      );
      console.log('value-->', value);
      let valueHex = base64ToByteArray(value?.value);
      console.log('Read HEXXX-->', valueHex);
      const decodedValue = convertHEX_to_ASCII(valueHex);
      setReadData(decodedValue);
      setShowReadModal(true);
    } catch (error) {
      console.log('Error reading characteristic', error);
    }
  };

  const notifyCharacteristic = async characteristic => {
    const subscription = await characteristic.monitor((error, char) => {
      if (error) {
        console.error('Notification error:', error);
        return;
      }
      console.log('Notification-->', char);
      let valueHex = base64ToByteArray(char?.value);
      console.log('Notification HEXXX-->', valueHex);
      setReadData(valueHex);
      setShowReadModal(true);
    });
  };

  const writeCharacteristic = async (characteristic, value) => {
    try {
      console.log("characteristic.uuid-->",characteristic.uuid)
      const hexValue = convertASCII_to_HEX(value);
      let byteArray = hexToBytes('68A3000003000000E82000');
      let base64 = byteArrayToBase64(byteArray);
      const result =
        await connectedDevice.writeCharacteristicWithResponseForService(
          selectedService,
          characteristic.uuid,
          base64,
        );
      console.log('Write Success-->', result);
      Alert.alert('Success', 'Data written successfully');
    } catch (error) {
      console.log('Error writing characteristic', error);
    }
  };

  const disconnectFromDevice = async () => {
    try {
      await manager.cancelDeviceConnection(connectedDevice.id);
      initData();
      setConnectedDevice(null);
      setServices([]);
      setSelectedService(null);
      setCharacteristics({});
      Alert.alert('Disconnected', 'Successfully disconnected from device');
    } catch (error) {
      console.log('Error disconnecting', error);
    }
  };

  const scan = () => {
    setScaning(true);
    deviceMap.current.clear();
    bleModule.manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log('startDeviceScan error:', error);
        if (error.errorCode === BleErrorCode.BluetoothPoweredOff) {
          requestPermissions();
        }
        setScaning(false);
      } else if (device) {
        //  console.log(device);
        console.log(device.id, device.name);
        if (device.name) {
          deviceMap.current.set(device.id, device);
          setData([...deviceMap.current.values()]);
        }
      }
    });
    scanTimer.current && clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => {
      bleModule.stopScan();
      setScaning(false);
    }, 3000);
  };

  const connect = (item: Device) => {
    if (scaning) {
      bleModule.stopScan();
      setScaning(false);
    }

    setConnectingId(item.id);
    bleModule
      .connect(item.id)
      .then(() => {
        setData([item]);
        setIsConnected(true);
        onDisconnect();
      })
      .catch(err => {
        alert(`Error: ${err}`);
      })
      .finally(() => {
        setConnectingId('');
      });
  };
  const disconnect = () => {
    bleModule.disconnect();
    initData();
  };

  const initData = () => {
    bleModule.initUUID();
    setData([...deviceMap.current.values()]);
    setIsConnected(false);
    setWriteData('');
    setReadData('');
    setReceiveData('');
    setInputText('');
  };

  const onDisconnect = () => {
    disconnectListener.current = bleModule.manager.onDeviceDisconnected(
      bleModule.peripheralId,
      (error, device) => {
        if (error) {
          console.log('device disconnect', error);
          initData();
        } else {
          disconnectListener.current?.remove();
          console.log('device disconnect', device!.id, device!.name);
        }
      },
    );
  };

  const renderDeviceItem = ({item}) => {
    const data = item;
    const disabled = !!connectingId && connectingId !== data.id;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled || isConnected}
        onPress={() => {
          connectToDevice(data);
        }}
        style={[styles.item, {opacity: disabled ? 0.5 : 1}]}>
        <View style={{flexDirection: 'row'}}>
          <Text style={{color: 'green'}}>{data.name ? data.name : ''}</Text>
          <Text style={{marginLeft: 50, color: 'red'}}>
            {connectingId === data.id ? 'connecting' : ''}
          </Text>
        </View>
        <Text>{data.id}</Text>
      </TouchableOpacity>
    );
  };

  const renderCharacteristicItem = ({item}) => (
    <View style={styles.characteristicItem}>
      <Text>Characteristic UUID: {item.uuid}</Text>
      {item.isReadable && (
        <Button title="Read" onPress={() => readCharacteristic(item)} />
      )}
      {item.isWritableWithResponse && (
        <Button
          title="Write"
          onPress={() => {
            setSelectedCharacteristic(item);
            setShowWriteModal(true);
          }}
        />
      )}
      {item.isNotifiable && (
        <Button
          title="Notify"
          onPress={() => {
            notifyCharacteristic(item);
          }}
        />
      )}
    </View>
  );

  const renderCharacteristicsSection = (title, data) => (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <FlatList
        data={data}
        keyExtractor={item => item.uuid}
        renderItem={renderCharacteristicItem}
        ListEmptyComponent={
          <Text>No {title.toLowerCase()} characteristics found</Text>
        }
      />
    </View>
  );
  const renderFooter = () => {
    if (!isConnected) {
      return;
    }
    return (
      <ScrollView
        style={{
          marginTop: 10,
          borderColor: '#eee',
          borderStyle: 'solid',
          borderTopWidth: StyleSheet.hairlineWidth * 2,
        }}>
        <Text style={styles.subHeader}>Available Services:</Text>
        <FlatList
          data={services}
          keyExtractor={item => item.uuid}
          renderItem={({item}) => (
            <TouchableOpacity
              onPress={() => fetchCharacteristicsForService(item)}>
              <Text style={styles.serviceItem}>Service UUID: {item.uuid}</Text>
            </TouchableOpacity>
          )}
        />
        {selectedService && characteristics[selectedService] && (
          <View style={styles.characteristicsContainer}>
            <Text style={styles.subHeader}>
              Characteristics for Service {selectedService}:
            </Text>
            {(() => {
              const {
                readCharacteristics,
                writeCharacteristics,
                notifyCharacteristics,
              } = groupCharacteristics(characteristics[selectedService]);

              return (
                <>
                  {renderCharacteristicsSection(
                    'Read Characteristics',
                    readCharacteristics,
                  )}
                  {renderCharacteristicsSection(
                    'Write Characteristics',
                    writeCharacteristics,
                  )}
                  {renderCharacteristicsSection(
                    'Notify Characteristics',
                    notifyCharacteristics,
                  )}
                </>
              );
            })()}
          </View>
        )}
      </ScrollView>
    );
  };
  return (
    <View style={styles.container}>
      <Text style={styles.header}>BLE Device Scanner</Text>
      <Header
        isConnected={isConnected}
        scaning={scaning}
        disabled={scaning || !!connectingId}
        onPress={isConnected ? disconnectFromDevice : scan}
      />
      <FlatList
        data={data}
        keyExtractor={item => item.id}
        renderItem={renderDeviceItem}
        extraData={connectingId}
        ListEmptyComponent={<Text>No devices found</Text>}
      />
      {renderFooter()}

      {/* Read Modal */}
      <Modal visible={showReadModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text>Read Data:</Text>
            <Text>{readData}</Text>
            <Button title="Close" onPress={() => setShowReadModal(false)} />
          </View>
        </View>
      </Modal>

      {/* Write Modal */}
      <Modal visible={showWriteModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text>Write Data:</Text>
            <View style={{height: 5}} />

            <TextInput
              style={styles.input}
              value={writeValue}
              onChangeText={setWriteValue}
            />
            <View
              style={{
                width: 200,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 10,
              }}>
              <Button
                title="Send"
                onPress={() => {
                  writeCharacteristic(selectedCharacteristic, writeValue);
                  setShowWriteModal(false);
                }}
              />

              <Button title="Cancel" onPress={() => setShowWriteModal(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    fontSize: 24,
    textAlign: 'center',
    marginVertical: 20,
  },
  deviceItem: {
    padding: 10,
    backgroundColor: '#fff',
    marginVertical: 8,
    borderRadius: 8,
    borderColor: '#ddd',
    borderWidth: 1,
  },
  connectedDevice: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderColor: '#ddd',
    borderWidth: 1,
  },
  subHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  serviceItem: {
    padding: 10,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  characteristicsContainer: {
    marginTop: 20,
    maxHeight: 500,
  },
  section: {
    marginVertical: 10,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  characteristicItem: {
    padding: 10,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Transparent background
  },
  modalContent: {
    backgroundColor: '#fff', // White background for the modal
    padding: 20,
    borderRadius: 10,
    width: 300,
    alignItems: 'center',
  },
  input: {
    width: 200,
    borderColor: '#ccc',
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  item: {
    flexDirection: 'column',
    borderColor: 'rgb(235,235,235)',
    borderStyle: 'solid',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 10,
    paddingVertical: 8,
  },
});

export default App;
export function alert(text: string) {
  Alert.alert('Hint', text, [{text: 'Sure', onPress: () => {}}]);
}
