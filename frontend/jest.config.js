const nextJest = require('next/jest')

const createJestConfig = nextJest({
    dir: './',
})

const customJestConfig = {
    setupFilesAfterEnv: ['<rootDir>/setupTests.js'], // Make sure this file exists
    testEnvironment: 'jest-environment-jsdom',
    moduleNameMapper: {  // Fixed: was "moduleNameMapping"
        '^@/(.*)$': '<rootDir>/$1',
    },
}

module.exports = createJestConfig(customJestConfig)