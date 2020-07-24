declare namespace pins {
    //% fixedInstance shim=pxt::getPin(PIN_LED)
    const LED: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_LED2)
    const LED2: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_LED3)
    const LED3: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_LED4)
    const LED4: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_LED5)
    const LED5: PwmOnlyPin;


    //% fixedInstance shim=pxt::getPin(PIN_A4)
    const A4: AnalogInPin;
    //% fixedInstance shim=pxt::getPin(PIN_A5)
    const A5: AnalogInPin;


    //% fixedInstance shim=pxt::getPin(PIN_NEOPIXEL)
    const NEOPIXEL: DigitalInOutPin;
}

declare namespace input {
    /**
     * Button 0
     */
    //% indexedInstanceNS=input indexedInstanceShim=pxt::getButton
    //% block="button 0" weight=95 fixedInstance
    //% shim=pxt::getButton(0)
    const button0: Button;

    /**
     * Button 1
     */
    //% indexedInstanceNS=input indexedInstanceShim=pxt::getButton
    //% block="button 1" weight=94 fixedInstance
    //% shim=pxt::getButton(1)
    const button1: Button;
}