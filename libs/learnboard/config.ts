namespace config {
    export const NUM_NEOPIXELS = 1;
    export const PIN_NEOPIXEL = DAL.PB23;

    export const PIN_LED = DAL.PA17;
    export const PIN_LED1 = PIN_LED;
    export const PIN_LED2 = DAL.PA18;
    export const PIN_LED3 = DAL.PA19;
    export const PIN_LED4 = DAL.PA20;
    export const PIN_LED5 = DAL.PA21;
    export const PIN_SPEAKER_AMP = DAL.PA30;

    // unknown pin id A4_SDA
    export const PIN_A4 = DAL.PA08;
    export const PIN_SDA = PIN_A4;
    // unknown pin id A5_SCL
    export const PIN_A5 = DAL.PA09;
    export const PIN_SCL = PIN_A5;



    // additional pins to look for: SPI, I2C, Flash
}