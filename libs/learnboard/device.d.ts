declare namespace pins {
    //% fixedInstance shim=pxt::getPin(PIN_LED)
    const LED: DigitalInOutPin;
    //% fixedInstance shim=pxt::getPin(PIN_LED2)
    const LED2: DigitalInOutPin;
    //% fixedInstance shim=pxt::getPin(PIN_LED3)
    const LED3: PwmPin;
    //% fixedInstance shim=pxt::getPin(PIN_LED4)
    const LED4: PwmPin;
    //% fixedInstance shim=pxt::getPin(PIN_LED5)
    const LED5: PwmPin;


    //% fixedInstance shim=pxt::getPin(PIN_A4)
    const A4: AnalogInOutPin;
    //% fixedInstance shim=pxt::getPin(PIN_A5)
    const A5: AnalogInOutPin;


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