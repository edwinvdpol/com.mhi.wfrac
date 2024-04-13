'use strict';

const Device = require('../../lib/Device');
const { filled, blank } = require('../../lib/Utils');
const {
  AirFlow, AirFlowNames,
  HorizontalPosition, HorizontalPositionNames,
  OperationMode, OperationModeNames,
  VerticalPosition, VerticalPositionNames,
} = require('../../lib/Enums');

class WFRACDevice extends Device {

  /*
  | Synchronization function
  */

  // Set account
  async syncAccount() {
    if (this.registered) return null;
    if (!this.getAvailable()) return null;

    // Number of accounts not set
    if (!this.accounts) {
      return this.error('[Sync] [Account] Number of accounts not set');
    }

    this.log(`[Sync] [Account] ${this.accounts} accounts`);

    // Register account
    if (this.accounts < 4) {
      await this.registerAccount();
    }

    // Account warning
    const warning = this.getAccountWarning();

    if (!warning) {
      return this.unsetWarning().catch(this.error);
    }

    // Set warning message
    this.setWarning(this.homey.__(warning)).catch(this.error);

    return this.error(warning);
  }

  // Set AirconStat
  async syncAirconStat(data = null) {
    if (!data) {
      data = await this.client.getAirconStat();
    }

    if (blank(data)) return;

    this.log('[Sync]', JSON.stringify(data));

    // Set available
    this.setAvailable().catch(this.error);

    // Set data
    this.airconStat = data.airconStat;
    delete data.airconStat;
    this.contents = data;

    // Set number of accounts and firmware type
    this.accounts = ('numOfAccount' in data) ? Number(data.numOfAccount) : null;
    this.firmware = ('firmType' in data) ? data.firmType : null;

    data = null;
  }

  // Set capabilities
  async syncCapabilities() {
    if (!this.airconStat) return;

    let stat = this.airconStat;

    // 3D AUTO
    if ('entrust' in stat && this.hasCapability('3d_auto')) {
      this.setCapabilityValue('3d_auto', stat.entrust).catch(this.error);
    }

    // Fan speed
    if ('airFlow' in stat && this.hasCapability('fan_speed')) {
      this.setCapabilityValue('fan_speed', AirFlow[stat.airFlow]).catch(this.error);
    }

    // Horizontal position
    if ('windDirectionLR' in stat && this.hasCapability('horizontal_position')) {
      this.setCapabilityValue('horizontal_position', HorizontalPosition[stat.windDirectionLR]).catch(this.error);
    }

    // Indoor temperature
    if ('indoorTemp' in stat && this.hasCapability('measure_temperature')) {
      this.setCapabilityValue('measure_temperature', stat.indoorTemp).catch(this.error);
    }

    // Operation
    if ('operation' in stat && this.hasCapability('onoff')) {
      this.setCapabilityValue('onoff', stat.operation).catch(this.error);
    }

    // Operating mode
    if ('operationMode' in stat && this.hasCapability('operating_mode')) {
      this.setCapabilityValue('operating_mode', OperationMode[stat.operationMode]).catch(this.error);
    }

    // Outdoor temperature
    if ('outdoorTemp' in stat && this.hasCapability('measure_temperature')) {
      this.setCapabilityValue('measure_temperature.outdoor', stat.outdoorTemp).catch(this.error);
    }

    // Preset temperature
    if ('presetTemp' in stat && this.hasCapability('target_temperature')) {
      this.setCapabilityValue('target_temperature', stat.presetTemp).catch(this.error);
    }

    // Vertical position
    if ('windDirectionUD' in stat && this.hasCapability('vertical_position')) {
      this.setCapabilityValue('vertical_position', VerticalPosition[stat.windDirectionUD]).catch(this.error);
    }

    stat = null;
  }

  // Set settings
  async syncSettings() {
    if (!this.contents) return;

    const settings = {};

    // Number of accounts
    if (this.accounts) {
      settings.accounts = String(this.accounts);
    }

    // Firmware type
    if (filled(this.firmware)) {
      settings.firmware_type = this.firmware;
    }

    // Wireless firmware
    if (filled(this.contents.wireless.firmVer)) {
      settings.wifi_firmware = this.contents.wireless.firmVer;
    }

    // MCU firmware
    if (filled(this.contents.mcu.firmVer)) {
      settings.mcu_firmware = this.contents.mcu.firmVer;
    }

    // Update settings
    if (filled(settings)) {
      this.setSettings(settings).catch(this.error);
    }

    // Firmware has warning
    if (this.setFirmwareWarning()) {
      return;
    }

    // Remove warning
    this.unsetWarning().catch(this.error);
  }

  /*
  | Capability actions
  */

  // Fan speed capability changed
  async onCapabilityFanSpeed(value) {
    this.log(`Fan speed changed to '${value}'`);

    await this.queue({ airFlow: AirFlowNames[value] });
  }

  // Horizontal position capability changed
  async onCapabilityHorizontalPosition(value) {
    this.log(`Horizontal position changed to '${value}'`);

    await this.queue({
      windDirectionLR: HorizontalPositionNames[value],
      entrust: false,
    });
  }

  // 3D AUTO capability changed
  async onCapability3dAuto(value) {
    this.log(`3D AUTO changed to '${value}'`);

    await this.queue({ entrust: value });
  }

  // On/off capability changed
  async onCapabilityOnOff(value) {
    this.log(`Operation changed to '${value}'`);

    await this.queue({ operation: value });
  }

  // Operating mode capability changed
  async onCapabilityOperatingMode(value) {
    this.log(`Operating mode changed to '${value}'`);

    await this.queue({ operationMode: OperationModeNames[value] });
  }

  // Target temperature capability changed
  async onCapabilityTargetTemperature(value) {
    this.log(`Target temperature changed to '${value}°C'`);

    await this.queue({ presetTemp: value });
  }

  // Vertical position capability changed
  async onCapabilityVerticalPosition(value) {
    this.log(`Vertical position changed to '${value}'`);

    await this.queue({
      windDirectionUD: VerticalPositionNames[value],
      entrust: false,
    });
  }

  /*
  | Account functions
  */

  // Delete account
  async deleteAccount(uninit = false) {
    if (!this.registered || !this.client) return;

    this.log('[Account] Deleting');
    this.log('-- Operator ID:', this.operatorId);

    // Delete account from device
    if (this.client) {
      this.log('Delete device account');
      await this.client.deleteAccountInfo();
    }

    this.log('[Account] Deleted');

    // Mark as unregistered
    if (!uninit) {
      await this.setRegistered(false);
    }
  }

  // Register account
  async registerAccount() {
    if (!this.getAvailable()) return null;

    this.log('[Account] Registering');
    this.log('[Account] Operator ID:', this.operatorId);

    // Send account to device
    await this.client.updateAccountInfo();

    this.log('[Account] Registered');

    // Mark as registered
    return this.setRegistered(true);
  }

  /*
  | Warning functions
  */

  // Return warning message for account
  getAccountWarning() {
    if (this.registered) return null;
    if (!this.accounts) return null;

    // Too many accounts
    if (this.accounts > 3) {
      return 'warning.accounts';
    }

    // Account not registered yet
    return 'warning.unregistered';
  }

  // Set firmware version not supported warning
  setFirmwareWarning() {
    if (!this.firmware) return false;
    if (this.firmware === 'WF-RAC') return false;

    const warning = this.homey.__('warning.firmware', { firmware: this.firmware });

    this.error(`Firmware '${this.firmware}' is not supported`);
    this.setWarning(warning).catch(this.error);

    return true;
  }

}

module.exports = WFRACDevice;
