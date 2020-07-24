namespace config {
    export const NUM_NEOPIXELS = 1;
    export const PIN_NEOPIXEL = DAL.PA01;

    export const PIN_LED = DAL.PA02;
    export const PIN_LED1 = PIN_LED;
    export const PIN_LED2 = DAL.PA05;
    export const PIN_LED3 = DAL.PA06;
    export const PIN_LED4 = DAL.PA07;
    export const PIN_LED5 = DAL.PA08;

    // unknown pin id A4_SDA
    export const PIN_A4 = DAL.PA03;
    export const PIN_SDA = PIN_A4;
    // unknown pin id A5_SCL
    export const PIN_A5 = DAL.PA04;
    export const PIN_SCL = PIN_A5;



    // additional pins to look for: SPI, I2C, Flash
}