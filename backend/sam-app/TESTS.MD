# Lambda Function Testing Setup

This directory contains automated tests for your AWS Lambda functions using Moto for mocking AWS services.

## 🚀 Quick Start

### Local Testing

```bash
# Install dependencies
pip install -r requirements-test.txt

# Build SAM application
sam build

# Run tests (simple version)
python test_all_functions.py

# Run tests (pytest version)
pytest test_lambda_functions_pytest.py -v
```

### CI/CD with GitHub Actions

1. **Push your code** to GitHub
2. **Create the workflow file** at `.github/workflows/test-lambda-functions.yml`
3. **Tests run automatically** on every push/PR

## 📁 File Structure

```
backend/sam-app/
├── .github/workflows/
│   └── test-lambda-functions.yml    # GitHub Actions workflow
├── test_all_functions.py            # Simple test script
├── test_lambda_functions_pytest.py  # Pytest version
├── requirements-test.txt            # Test dependencies
└── template.yaml                    # SAM template
```

## 🧪 What Gets Tested

- ✅ **Connect Function**: WebSocket connection handling
- ✅ **Disconnect Function**: WebSocket disconnection handling
- ✅ **Broadcast Function**: Message broadcasting to all connections
- ✅ **DynamoDB Operations**: Table creation, item insertion, deletion
- ✅ **API Gateway Management**: WebSocket message posting (mocked)

## 🔧 Test Configuration

### Environment Variables
```bash
CONNECTIONS_TABLE=test-connections
WEBSOCKET_API_ENDPOINT=test-endpoint.execute-api.eu-north-1.amazonaws.com
```

### Mocked Services
- **DynamoDB**: Mocked using a pytest fixture for all tests (not decorators)
- **API Gateway Management API**: Mocked with the `@mock_apigatewaymanagementapi` decorator (only for the broadcast test)

## 📋 Expected Test Output

```
Running local tests with Moto...
Make sure you've run: sam build
Welcome message failed: Could not connect to the endpoint URL: "https://..."
✅ Connect function works!
✅ Disconnect function works!
✅ Broadcast function works!

🎉 All tests passed!
```

*Note: "Welcome message failed" is expected - it's the mocked API Gateway endpoint*

## 🐛 Troubleshooting

### Common Issues

1. **Import Error**: Make sure you've run `sam build` first
2. **Module Not Found**: Check your Python path and SAM build directory
3. **Version Conflicts**: Use the exact moto version specified in requirements-test.txt

### Debug Commands

```bash
# Check moto version
python -c "import moto; print(moto.__version__)"

# Check available mocks
python -c "import moto; print(dir(moto))"

# Verify SAM build
ls -la .aws-sam/build/
```

## 🚀 Next Steps

1. **Add more test cases** for edge cases
2. **Test error handling** scenarios
3. **Add integration tests** with real AWS services
4. **Set up deployment pipeline** after tests pass
5. **Add performance testing** with load simulation

## 📊 GitHub Actions Features

- **Automatic testing** on push/PR
- **Python 3.9** environment
- **SAM CLI** setup
- **Dependency caching** for faster builds
- **Test reporting** in PR comments